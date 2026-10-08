import { ProfileForm } from './ProfileForm';

export const metadata = {
  title: 'Hồ sơ cá nhân',
  description:
    'Trang thông tin cá nhân của người dùng, nơi hiển thị các thông tin liên quan đến tài khoản và cài đặt cá nhân.',
};

export default function ProfilePage() {
  return <ProfileForm metadata={metadata} />;
}
