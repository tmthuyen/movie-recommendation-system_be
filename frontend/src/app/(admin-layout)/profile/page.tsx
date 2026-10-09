import { ProfileForm } from './ProfileForm';

export const metadata = {
  title: 'Hồ sơ cá nhân',
  description:
    'Trang thông tin cá nhân của người dùng, nơi hiển thị các thông tin liên quan đến tài khoản và cài đặt cá nhân.',
};

export default function ProfilePage() {
  return (
    <>
      <div className="animate-fade-in w-full space-y-6 pb-10">
        <div className="flex flex-col gap-2">
          <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white">
            {metadata.title}
          </h2>
          <p className="text-gray-500 dark:text-gray-400">{metadata.description}</p>
        </div>

        <ProfileForm metadata={metadata} />
      </div>
    </>
  );
}
