import React from 'react';

export const metadata = {
  title: 'Dashboard',
  description:
    'Trang tổng quan của hệ thống, nơi hiển thị các thông tin quan trọng và các chỉ số liên quan đến hoạt động của ứng dụng.',
};

export default function Page() {
  return (
    <div className="flex h-full w-full flex-col gap-4">
      {/* title */}
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white">{metadata.title}</h2>
        <p className="text-gray-500 dark:text-gray-400">{metadata.description}</p>
      </div>

      {/* content */}
      <div className="flex items-center justify-center">Content</div>
    </div>
  );
}
