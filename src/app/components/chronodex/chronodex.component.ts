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
    readonly size = 500;
    readonly center = 250;
    readonly radius = 150;
    readonly viewBox = `0 0 ${this.size} ${this.size}`;

    // Interactions
    isDragging = false;
    draggedActivityId: string | null = null;
    dragMode: 'start' | 'end' = 'end';

    // Modal State
    isModalOpen = false;
    editingActivity: Activity | null = null;

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

    handleMouseDown(event: MouseEvent, activityId: string, mode: 'start' | 'end') {
        event.stopPropagation();
        this.isDragging = true;
        this.draggedActivityId = activityId;
        this.dragMode = mode;
    }

    @HostListener('window:mousemove', ['$event'])
    onMouseMove(event: MouseEvent) {
        if (!this.isDragging || !this.draggedActivityId) return;

        const angle = this.getAngleFromEvent(event);
        const snappedAngle = snapAngleTo15Min(angle);
        const activity = this.activities.find(a => a.id === this.draggedActivityId);

        if (activity) {
            let updatedActivity = { ...activity };

            if (this.dragMode === 'end') {
                updatedActivity.endTime = angleToTime(snappedAngle, activity.startTime);
            } else { // this.dragMode === 'start'
                updatedActivity.startTime = angleToTime(snappedAngle, activity.endTime);
            }

            // Calculate duration
            let diff = (updatedActivity.endTime.getTime() - updatedActivity.startTime.getTime()) / (1000 * 60);
            if (diff < 0) diff += 24 * 60; // Wrap around

            updatedActivity.durationMinutes = diff;
            this.chronodexService.updateActivity(updatedActivity);
        }
    }

    @HostListener('window:mouseup')
    onMouseUp() {
        this.isDragging = false;
        this.draggedActivityId = null;
    }

    openEditModal(activity: Activity, event: MouseEvent) {
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

    private getAngleFromEvent(event: MouseEvent): number {
        const svg = document.querySelector('svg');
        if (!svg) return 0;

        const CTM = svg.getScreenCTM();
        if (!CTM) return 0;

        const pt = svg.createSVGPoint();
        pt.x = event.clientX;
        pt.y = event.clientY;
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
        const colors = ['#ff9f43', '#00d2d3', '#54a0ff', '#5f27cd', '#ff6b6b', '#48dbfb', '#1dd1a1'];
        return colors[Math.floor(Math.random() * colors.length)];
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
