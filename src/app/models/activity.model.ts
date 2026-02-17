export interface Activity {
    id: string;
    title: string;
    startTime: Date;
    endTime: Date;
    durationMinutes: number;
    color: string;
}

export interface ActivityForm {
    title: string;
    startTime: string; // ISO string or HH:mm
    endTime: string;
    color: string;
}

export type Point = { x: number; y: number };
