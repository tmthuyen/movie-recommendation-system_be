import { FailedEventsClient } from './failed-events-client';

export const metadata = {
  title: 'Sự kiện lỗi',
  description: 'Xem và phát lại các sự kiện rớt DLQ (failed events).',
};

export default function Page() {
  return <FailedEventsClient />;
}
