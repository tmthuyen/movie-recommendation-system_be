import { ulid } from 'ulid';

export function generateUniqueId(): string {
    return ulid();
}