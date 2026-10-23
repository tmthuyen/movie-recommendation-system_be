# V15 — preference onboarding popup (cold-start user)

## Thông tin chung
- **Trạng thái**: Đang thực hiện
- **Người thực hiện & thời gian**: AI Agent — 2026-10-20
- **Scope**: frontend
- **Module liên quan**: `frontend/src/components/`, `frontend/src/app/`, `frontend/src/hooks/`, `frontend/src/stores/`, `frontend/src/apis/`, `frontend/src/shared/`
- **Mục tiêu**: Giảm cold-start cho user mới bằng cách gợi ý chọn thể loại yêu thích (`preferenceData.genre`) ngay sau đăng nhập nếu chưa có dữ liệu. Chỉ tập trung vào `preferenceData` (key `genres`/`genre` theo cách lưu hiện tại).

## Bối cảnh
- `User.preferenceData?: Record<string, string[]>` (backend trả về dạng object). Trên UI profile đang lưu dưới dạng `{ genre: string[] }` (mảng tên thể loại).
- Trang `/(main)/profile` đã có form cập nhật profile với multi-select thể loại (`InputMultiSelectDemo`) đầy đủ field.
- API cập nhật profile dùng `PUT/PATCH /users/:id` hoặc endpoint hiện tại qua `userApi.updateMe`/`useUser.useUpdateMe` (phải tuân thủ `docs/BACKEND.md`, không bịa endpoint).
- Chỉ xử lý `preferenceData.genre` cho task này, không mở rộng sang các preference khác.

## Phạm vi
**Trong phạm vi:**
- [ ] Kiểm tra điều kiện hiển thị popup: user đã đăng nhập, `preferenceData` không tồn tại hoặc `preferenceData.genre` rỗng/undefined.
- [ ] Tạo component `PreferenceOnboardingDialog` (shadcn Dialog) hiển thị danh sách thể loại (gọi `useGenre.useGetAll()`).
- [ ] Cho phép user click chọn/bỏ chọn nhiều thể loại, hiển thị badge đã chọn.
- [ ] Nút "Bỏ qua" và "Lưu và tiếp tục". "Bỏ qua" có thể ghi nhớ trong `localStorage` theo `userId` để không hiện lại (tránh spam).
- [ ] Gọi API cập nhật profile chỉ với `preferenceData: { genre: [...] }` (giữ nguyên các field khác không bị ảnh hưởng).
- [ ] Sau khi lưu thành công: refresh user trong `auth.store`, đóng popup, toast thành công.
- [ ] Tích hợp vào layout chính (`/(main)/layout.tsx`) hoặc component client cấp cao để popup có thể xuất hiện toàn cục sau khi auth sẵn sàng.
- [ ] Đảm bảo responsive, accessible (focus trap, keyboard), tuân thủ pattern UI hiện tại.

**Ngoài phạm vi:**
- Thay đổi schema/profile form tổng thể
- Thêm preference khác ngoài genres
- Sửa backend/ai-service
- Tạo trang onboarding riêng

## Thiết kế kỹ thuật
### Điều kiện hiển thị
- Chỉ hiển thị khi `isAuthenticated` và user đã load xong.
- Ẩn nếu `localStorage.getItem(\`preference_onboarding_skipped_${user.id}\`) === 'true'`.
- Ẩn nếu `user.preferenceData?.genre && user.preferenceData.genre.length > 0`.
- Ẩn nếu đang ở trang `/auth/*`.

### Component
- `frontend/src/components/onboarding/preference-onboarding-dialog.tsx` (hoặc `components/profile/preference-onboarding-dialog.tsx`) 
- Sử dụng `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter` từ shadcn/ui.
- Sử dụng `Badge`, `Button`, `Skeleton` theo pattern dự án.
- Lấy genres từ `useGenre.useGetAll()` (đã có hook).

### API/State
- Cập nhật: dùng `useUser.useUpdateMe()` với payload `UpdateProfileDto` chứa `preferenceData: { genre: selectedGenreNames }` (giống cách `UserProfileForm` đang làm).
- Sau success: gọi `useAuthStore.getState().refreshUser()` hoặc cập nhật store để UI phản ánh ngay.
- Xử lý lỗi theo chuẩn (toast + không đóng popup nếu lỗi).

### Tích hợp
- Tạo `PreferenceOnboardingProvider` hoặc component `PreferenceOnboardingGate` render trong `app/(main)/layout.tsx` (client component) bên dưới các provider cần thiết.
- Đảm bảo không gây layout shift, không block render quan trọng.

## Các bước thực hiện
1. **Plan**: Tạo file plan này, cập nhật `docs/plans/PLAN_INDEX.md` (thêm V15, next_index = 16).
2. **Component**: Tạo `preference-onboarding-dialog.tsx` với logic chọn genres.
3. **Gate/Integration**: Tạo gate component và thêm vào `app/(main)/layout.tsx`.
4. **Test thủ công**: Tạo user mới (hoặc xóa preferenceData) → đăng nhập → popup hiện → chọn genres → lưu → popup đóng, user.profile cập nhật.
5. **Kiểm tra**: `tsc --noEmit`, build (nếu có thời gian), đảm bảo không vi phạm rules.

## Rủi ro
- **Trùng popup**: cần guard cẩn thận (mounted/check + localStorage + user state).
- **Race condition**: chờ auth store hydrate xong trước khi quyết định hiển thị.
- **Format preferenceData**: phải khớp đúng format backend mong đợi (`Record<string, string[]>`). Hiện tại profile dùng `{ genre: string[] }` (tên genre) — giữ nguyên format này.
- **Không ảnh hưởng user đã có preference**: chỉ show khi trống.

## Tiêu chí hoàn thành
- [ ] Plan đã tạo và cập nhật PLAN_INDEX.md
- [ ] Popup chỉ hiện khi user chưa có `preferenceData.genre`
- [ ] Có thể chọn nhiều genres từ danh sách API
- [ ] Cập nhật thành công qua API hiện có
- [ ] Không hiện lại sau khi lưu hoặc sau khi chọn "Bỏ qua" (theo userId)
- [ ] Code tuân thủ pattern frontend hiện tại, type-safe, responsive
- [ ] `tsc --noEmit` pass, không thêm lỗi mới
