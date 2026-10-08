export default function Spining() {
  // You can render any UI here, including a skeleton component
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="border-accent h-24 w-24 animate-spin rounded-full border-t-5 border-b-5"></div>
      <p className="ml-3 text-lg font-semibold text-gray-700">Đang tải...</p>
    </div>
  );
}
