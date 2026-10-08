const USER_STATUS = {
  ACTIVE: 'Hoạt động',
  UNVERIFIED: 'Chưa xác thực',
  LOCKED: 'Đã khóa',
  INACTIVE: 'Không hoạt động',
  PENDING: 'Đang chờ',
};

const USER_STATUS_COLOR = {
  ACTIVE: 'text-green-500 border border-green-500',
  INACTIVE: 'text-gray-500 border border-gray-500',
  PENDING: 'text-yellow-500 border border-yellow-500',
  UNVERIFIED: 'text-yellow-500 border border-yellow-500',
  LOCKED: 'text-red-500 border border-red-500',
};

const mapUserStatus = (status: string) => {
  status = status.toUpperCase();
  // check exist status in USER_STATUS
  if (USER_STATUS[status as keyof typeof USER_STATUS]) {
    return {
      label: USER_STATUS[status as keyof typeof USER_STATUS],
      color: USER_STATUS_COLOR[status as keyof typeof USER_STATUS],
    };
  }
  return {
    label: status,
    color: 'text-gray-500 border border-gray-500',
  };
};

export { mapUserStatus };
