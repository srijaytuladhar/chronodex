import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Activity } from '../models/activity.model';

@Injectable({
    providedIn: 'root'
})
export class ChronodexService {
    private readonly STORAGE_KEY = 'chronodex_activities';
    private activitiesSubject = new BehaviorSubject<Activity[]>([]);
    activities$: Observable<Activity[]> = this.activitiesSubject.asObservable();

    constructor() {
        this.loadFromStorage();
    }

    private loadFromStorage() {
        const saved = localStorage.getItem(this.STORAGE_KEY);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                // Revive Date objects
                const activities = parsed.map((a: any) => ({
                    ...a,
                    startTime: new Date(a.startTime),
                    endTime: new Date(a.endTime)
                }));
                this.activitiesSubject.next(activities);
            } catch (e) {
                console.error('Failed to parse saved activities', e);
                this.activitiesSubject.next([]);
            }
        }
    }

    private saveToStorage(activities: Activity[]) {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(activities));
    }

    getActivities(): Activity[] {
        return this.activitiesSubject.value;
    }

    addActivity(activity: Activity) {
        const current = this.activitiesSubject.value;
        const updated = [...current, activity];
        this.activitiesSubject.next(updated);
        this.saveToStorage(updated);
    }

    updateActivity(activity: Activity) {
        const current = this.activitiesSubject.value;
        const index = current.findIndex(a => a.id === activity.id);
        if (index !== -1) {
            const updated = [...current];
            updated[index] = activity;
            this.activitiesSubject.next(updated);
            this.saveToStorage(updated);
        }
    }

    deleteActivity(id: string) {
        const current = this.activitiesSubject.value;
        const updated = current.filter(a => a.id !== id);
        this.activitiesSubject.next(updated);
        this.saveToStorage(updated);
    }

    clearActivities() {
        this.activitiesSubject.next([]);
        this.saveToStorage([]);
    }

    isOverlapping(newActivity: Activity, excludeId?: string): boolean {
        const activities = this.activitiesSubject.value;
        return activities.some(a => {
            if (excludeId && a.id === excludeId) return false;

            const start1 = newActivity.startTime.getTime();
            const end1 = newActivity.endTime.getTime();
            const start2 = a.startTime.getTime();
            const end2 = a.endTime.getTime();

            // Standard overlap check: (StartA < EndB) and (EndA > StartB)
            return (start1 < end2) && (end1 > start2);
        });
    }
}
