# V15 — preference onboarding popup (cold-start user)

## Thông tin chung
- **Trạng thái**: ✅ Hoàn thành (xác minh 2026-11-04)
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
- [x] Kiểm tra điều kiện hiển thị popup: user đã đăng nhập, `preferenceData` không tồn tại hoặc `preferenceData.genre` rỗng/undefined. — `preference-onboarding-gate.tsx:24-51`
- [x] Tạo component `PreferenceOnboardingDialog` (shadcn Dialog) hiển thị danh sách thể loại (gọi `useGenre.useGetAll()`). — `preference-onboarding-dialog.tsx:40`
- [x] Cho phép user click chọn/bỏ chọn nhiều thể loại, hiển thị badge đã chọn. — `:76-90`
- [x] Nút "Bỏ qua" và "Lưu và tiếp tục". "Bỏ qua" có thể ghi nhớ trong `localStorage` theo `userId` để không hiện lại (tránh spam). — `gate:84-89` (`preference_onboarding_skipped_${user.id}`)
- [x] Gọi API cập nhật profile chỉ với `preferenceData: { genre: [...] }` (giữ nguyên các field khác không bị ảnh hưởng). — `gate:72-75` (`useUpdateMe`)
- [x] Sau khi lưu thành công: refresh user trong `auth.store`, đóng popup, toast thành công. — `gate:76-78` (`refreshUser` + `setOpen(false)`); toast do mutation `onError`/`onSuccess` xử lý
- [x] Tích hợp vào layout chính (`/(main)/layout.tsx`) hoặc component client cấp cao để popup có thể xuất hiện toàn cục sau khi auth sẵn sàng. — `frontend/src/app/(main)/layout.tsx:4,11`
- [x] Đảm bảo responsive, accessible (focus trap, keyboard), tuân thủ pattern UI hiện tại. — Dialog shadcn (focus trap mặc định), `aria-label` cho nút xóa badge, layout `max-h-[90vh]` cuộn được

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
1. **Plan**: Tạo file plan này, cập nhật `docs/plans/PLAN_INDEX.md` (thêm V15, next_index = 16). — ✅ index 15 đã có trong `PLAN_INDEX.md`
2. **Component**: Tạo `preference-onboarding-dialog.tsx` với logic chọn genres. — ✅
3. **Gate/Integration**: Tạo gate component và thêm vào `app/(main)/layout.tsx`. — ✅
4. **Test thủ công**: Tạo user mới (hoặc xóa preferenceData) → đăng nhập → popup hiện → chọn genres → lưu → popup đóng, user.profile cập nhật. — ✅ đã smoke test trong quá trình phát triển
5. **Kiểm tra**: `tsc --noEmit`, build (nếu có thời gian), đảm bảo không vi phạm rules. — ✅ thuộc CI frontend (`V14`), `tsc --noEmit` + build xanh

## Rủi ro
- **Trùng popup**: cần guard cẩn thận (mounted/check + localStorage + user state). — đã xử lý bằng `mounted` + `isLoading` + `localStorage` (gate:19-51)
- **Race condition**: chờ auth store hydrate xong trước khi quyết định hiển thị. — đã xử lý (`isLoading`)
- **Format preferenceData**: phải khớp đúng format backend mong đợi (`Record<string, string[]>`). Hiện tại profile dùng `{ genre: string[] }` (tên genre) — giữ nguyên format này.
- **Không ảnh hưởng user đã có preference**: chỉ show khi trống. — đã xử lý (gate:30-38)

## Tiêu chí hoàn thành
- [x] Plan đã tạo và cập nhật PLAN_INDEX.md
- [x] Popup chỉ hiện khi user chưa có `preferenceData.genre`
- [x] Có thể chọn nhiều genres từ danh sách API
- [x] Cập nhật thành công qua API hiện có
- [x] Không hiện lại sau khi lưu hoặc sau khi chọn "Bỏ qua" (theo userId)
- [x] Code tuân thủ pattern frontend hiện tại, type-safe, responsive
- [x] `tsc --noEmit` pass, không thêm lỗi mới

---

## Báo cáo xác minh (2026-11-04)

| Hạng mục | Bằng chứng |
|---|---|
| Component dialog | `frontend/src/components/onboarding/preference-onboarding-dialog.tsx` (Dialog shadcn + Badge + Skeleton + `useGenre.useGetAll`) |
| Component gate | `frontend/src/components/onboarding/preference-onboarding-gate.tsx` (guard mounted/isLoading/pathname/localStorage) |
| Tích hợp layout | `frontend/src/app/(main)/layout.tsx:4,11` → `<PreferenceOnboardingGate />` trong `RoleLayout` |
| Cập nhật profile | `useUser.useUpdateMe()` + `useAuthStore.getState().refreshUser()` |

**Kết luận**: plan đã hoàn thành; chuyển trạng thái từ "Đang thực hiện" → "✅ Hoàn thành".

**Ghi chú kỹ thuật (không chặn)**: trong `handleSave` còn nhánh `if (selectedGenres.length === 0)` rỗng (comment để ngỏ) — hiện cho phép lưu mảng rỗng. Nếu muốn bắt buộc chọn ≥1 thể loại thì cần sửa ở task frontend riêng (ngoài phạm vi V17/V18).
