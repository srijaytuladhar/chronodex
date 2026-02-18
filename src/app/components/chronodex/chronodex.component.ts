import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChronodexService } from '../../services/chronodex.service';
import { Activity, Point } from '../../models/activity.model';
import {
    describeArc,
    timeToAngle,
    angleToTime,
    snapAngleTo15Min,
    polarToCartesian
} from '../../utils/time-utils';
import { Subscription, interval } from 'rxjs';

@Component({
    selector: 'app-chronodex',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './chronodex.component.html',
    styleUrls: ['./chronodex.component.css']
})
export class ChronodexComponent implements OnInit, OnDestroy {
    activities: Activity[] = [];
    currentTime = new Date();
    private subs = new Subscription();

    // SVG Config
    readonly size = 600;
    readonly center = 300;
    readonly radius = 200;
    readonly viewBox = `0 0 ${this.size} ${this.size}`;

    // Interactions
    isDragging = false;
    draggedActivityId: string | null = null;
    dragMode: 'start' | 'end' | 'move' = 'end';
    dragStartAngle: number = 0;
    initialStartTime?: Date;
    initialEndTime?: Date;
    initialDuration?: number;
    hasMoved = false;

    // Modal State
    isModalOpen = false;
    editingActivity: Activity | null = null;
    readonly predefinedColors = [
        '#ff5e57', // Red
        '#1dd1a1', // Green
        '#54a0ff', // Blue
        '#00d2d3', // Teal
        '#fbc531', // Gold
        '#dcdde1', // Silver
        '#eabfb9', // Rosegold
        '#ffffff'  // White
    ];

    constructor(private chronodexService: ChronodexService) { }

    ngOnInit() {
        this.subs.add(
            this.chronodexService.activities$.subscribe(acts => {
                this.activities = acts;
            })
        );

        // Update current time indicator every minute
        this.subs.add(
            interval(60000).subscribe(() => {
                this.currentTime = new Date();
            })
        );
    }

    ngOnDestroy() {
        this.subs.unsubscribe();
    }

    get hours() {
        return Array.from({ length: 24 }, (_, i) => i);
    }

    get halfHours() {
        return Array.from({ length: 48 }, (_, i) => i / 2);
    }

    get leveledActivities() {
        // Sort activities by start time to assign levels consistently
        const sorted = [...this.activities].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
        const result: (Activity & { level: number })[] = [];

        for (const act of sorted) {
            let level = 0;
            // Find the first level where this activity doesn't overlap with others at that level
            while (result.some(r => r.level === level && this.areOverlapping(act, r))) {
                level++;
            }
            result.push({ ...act, level });
        }
        return result;
    }

    private areOverlapping(a: Activity, b: Activity): boolean {
        const start1 = a.startTime.getTime();
        const end1 = a.endTime.getTime();
        const start2 = b.startTime.getTime();
        const end2 = b.endTime.getTime();

        // Standard overlap check: (StartA < EndB) and (EndA > StartB)
        // We also need to handle the 24h wrap if we were strictly within a day, 
        // but the current implementation uses Date objects which include calendar dates.
        return (start1 < end2) && (end1 > start2);
    }

    getActivityRadius(level: number): number {
        return this.radius + (level * 25);
    }

    getArcPath(activity: Activity, level: number = 0): string {
        const startAngle = timeToAngle(activity.startTime);
        const endAngle = timeToAngle(activity.endTime);
        let adjustedEndAngle = endAngle;
        if (endAngle < startAngle) {
            adjustedEndAngle += 360;
        }
        const r = this.getActivityRadius(level);
        return describeArc(this.center, this.center, r, startAngle, adjustedEndAngle);
    }

    getCurrentTimeRotation(): number {
        return timeToAngle(this.currentTime);
    }

    getHourPoint(hour: number, rOffset = 0): Point {
        const angle = hour * 15;
        return polarToCartesian(this.center, this.center, this.radius + rOffset, angle);
    }

    addNow() {
        const startTime = new Date();
        // Round to nearest 15 mins for consistency
        const minutes = startTime.getMinutes();
        const roundedMinutes = Math.round(minutes / 15) * 15;
        startTime.setMinutes(roundedMinutes, 0, 0);

        const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);

        const newActivity: Activity = {
            id: crypto.randomUUID(),
            title: 'New Activity',
            startTime,
            endTime,
            durationMinutes: 60,
            color: this.getRandomColor()
        };

        this.chronodexService.addActivity(newActivity);
    }

    handleMouseDown(event: MouseEvent | TouchEvent, activityId: string, mode: 'start' | 'end' | 'move') {
        event.stopPropagation();
        this.isDragging = true;
        this.draggedActivityId = activityId;
        this.dragMode = mode;
        this.dragStartAngle = this.getAngleFromEvent(event);

        const activity = this.activities.find(a => a.id === activityId);
        if (activity) {
            this.initialStartTime = new Date(activity.startTime);
            this.initialEndTime = new Date(activity.endTime);
            this.initialDuration = activity.durationMinutes;
            this.hasMoved = false;
        }
    }

    @HostListener('window:mousemove', ['$event'])
    @HostListener('window:touchmove', ['$event'])
    onMove(event: MouseEvent | TouchEvent) {
        if (!this.isDragging || !this.draggedActivityId) return;

        // Prevent default to disable scrolling while dragging on mobile
        if (event instanceof TouchEvent) {
            event.preventDefault();
        }

        const angle = this.getAngleFromEvent(event);

        // Threshold to avoid shaky clicks being counted as drags
        if (!this.hasMoved && Math.abs(angle - this.dragStartAngle) > 2) {
            this.hasMoved = true;
        }

        if (!this.hasMoved && this.dragMode === 'move') return;

        const snappedAngle = snapAngleTo15Min(angle);
        const activity = this.activities.find(a => a.id === this.draggedActivityId);

        if (activity) {
            let updatedActivity = { ...activity };

            if (this.dragMode === 'move' && this.initialStartTime && this.initialEndTime) {
                const angleDiff = snappedAngle - snapAngleTo15Min(this.dragStartAngle);
                const timeDiffMs = (angleDiff / 15) * 60 * 60 * 1000;

                updatedActivity.startTime = new Date(this.initialStartTime.getTime() + timeDiffMs);
                updatedActivity.endTime = new Date(this.initialEndTime.getTime() + timeDiffMs);
                updatedActivity.durationMinutes = this.initialDuration || activity.durationMinutes;
            } else if (this.dragMode === 'end') {
                updatedActivity.endTime = angleToTime(snappedAngle, activity.startTime);
                let diff = (updatedActivity.endTime.getTime() - updatedActivity.startTime.getTime()) / (1000 * 60);
                if (diff < 0) diff += 24 * 60;
                updatedActivity.durationMinutes = diff;
            } else if (this.dragMode === 'start') {
                updatedActivity.startTime = angleToTime(snappedAngle, activity.endTime);
                let diff = (updatedActivity.endTime.getTime() - updatedActivity.startTime.getTime()) / (1000 * 60);
                if (diff < 0) diff += 24 * 60;
                updatedActivity.durationMinutes = diff;
            }

            const hasChanged =
                updatedActivity.startTime.getTime() !== activity.startTime.getTime() ||
                updatedActivity.endTime.getTime() !== activity.endTime.getTime();

            if (hasChanged) {
                this.chronodexService.updateActivity(updatedActivity);
            }
        }
    }

    @HostListener('window:mouseup')
    @HostListener('window:touchend')
    @HostListener('window:touchcancel')
    onEnd() {
        this.isDragging = false;
        this.draggedActivityId = null;
    }

    openEditModal(activity: Activity, event: MouseEvent) {
        if (this.hasMoved) return;
        event.stopPropagation();
        this.editingActivity = { ...activity };
        this.isModalOpen = true;
    }

    saveActivity() {
        if (this.editingActivity) {
            this.chronodexService.updateActivity(this.editingActivity);
            this.closeModal();
        }
    }

    deleteActivity() {
        if (this.editingActivity) {
            this.chronodexService.deleteActivity(this.editingActivity.id);
            this.closeModal();
        }
    }

    closeModal() {
        this.isModalOpen = false;
        this.editingActivity = null;
    }

    clearAll() {
        if (confirm('Are you sure you want to clear all activities?')) {
            this.chronodexService.clearActivities();
        }
    }

    private getAngleFromEvent(event: MouseEvent | TouchEvent): number {
        const svg = document.querySelector('svg');
        if (!svg) return 0;

        const CTM = svg.getScreenCTM();
        if (!CTM) return 0;

        const pt = svg.createSVGPoint();

        if (event instanceof MouseEvent) {
            pt.x = event.clientX;
            pt.y = event.clientY;
        } else if (event.touches && event.touches.length > 0) {
            pt.x = event.touches[0].clientX;
            pt.y = event.touches[0].clientY;
        } else {
            return 0;
        }

        const svgPt = pt.matrixTransform(CTM.inverse());

        const dx = svgPt.x - this.center;
        const dy = svgPt.y - this.center;

        // atan2 returns radians from positive X axis. 
        // We want 0 at top (negative Y axis).
        let angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
        if (angle < 0) angle += 360;

        return angle;
    }

    private getRandomColor(): string {
        return this.predefinedColors[Math.floor(Math.random() * this.predefinedColors.length)];
    }

    getHandleCoords(activity: Activity, level: number = 0): Point {
        const angle = timeToAngle(activity.endTime);
        const r = this.getActivityRadius(level);
        return polarToCartesian(this.center, this.center, r, angle);
    }

    getStartHandleCoords(activity: Activity, level: number = 0): Point {
        const angle = timeToAngle(activity.startTime);
        const r = this.getActivityRadius(level);
        return polarToCartesian(this.center, this.center, r, angle);
    }

    getMidPointAngle(activity: Activity): number {
        const startAngle = timeToAngle(activity.startTime);
        let endAngle = timeToAngle(activity.endTime);
        if (endAngle < startAngle) endAngle += 360;
        return (startAngle + endAngle) / 2;
    }

    getPointOnCircle(angle: number, rOffset: number, level: number = 0): Point {
        const r = this.getActivityRadius(level);
        return polarToCartesian(this.center, this.center, r + rOffset, angle);
    }

    getLabelAlignment(angle: number): string {
        const normalizedAngle = ((angle % 360) + 360) % 360;
        if (normalizedAngle > 0 && normalizedAngle < 180) return 'start';
        if (normalizedAngle > 180 && normalizedAngle < 360) return 'end';
        return 'middle';
    }
}
