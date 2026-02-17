import { Point } from '../models/activity.model';

export function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number): Point {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;

    return {
        x: centerX + radius * Math.cos(angleInRadians),
        y: centerY + radius * Math.sin(angleInRadians),
    };
}

export function describeArc(x: number, y: number, radius: number, startAngle: number, endAngle: number): string {
    // Ensure we don't draw a full circle as a single arc (SVG limitation)
    if (Math.abs(endAngle - startAngle) >= 360) {
        endAngle = startAngle + 359.99;
    }

    const start = polarToCartesian(x, y, radius, endAngle);
    const end = polarToCartesian(x, y, radius, startAngle);

    const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

    const d = [
        'M', start.x, start.y,
        'A', radius, radius, 0, largeArcFlag, 0, end.x, end.y,
        'L', x, y,
        'Z'
    ].join(' ');

    return d;
}

export function timeToAngle(date: Date): number {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    return (hours + minutes / 60) * 15; // 360 / 24 = 15
}

export function angleToTime(angle: number, baseDate: Date): Date {
    const normalizedAngle = (angle + 360) % 360;
    const totalHours = normalizedAngle / 15;
    const hours = Math.floor(totalHours);
    const minutes = Math.round((totalHours - hours) * 60);

    const newDate = new Date(baseDate);
    newDate.setHours(hours, minutes, 0, 0);
    return newDate;
}

export function snapAngleTo15Min(angle: number): number {
    const step = 3.75; // 15 mins = 15° / 4
    return Math.round(angle / step) * step;
}
