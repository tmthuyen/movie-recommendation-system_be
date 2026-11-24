# V39 — Backend + Frontend: lấy phim mới từ TMDB

## Trạng thái

🟡 Đang triển khai — Phase 1–7 (backend, Swagger, options, UI) đã xong code + gate tự động; smoke runtime option chờ token TMDB thật; QA browser thủ công chưa chạy

## Người thực hiện & thời gian

| Hạng mục         | Nội dung     |
| ---------------- | ------------ |
| Người thực hiện  | Dev, Copilot |
| Bắt đầu          | 2026-11-20   |
| Cập nhật backend | 2026-11-24   |
| Cập nhật frontend | 2026-11-24  |
| Phạm vi          | Backend + Frontend |
| Methodology      | Traditional  |
| Complexity       | Simple       |

## 1. Mục tiêu

- Admin lấy danh sách phim mới từ TMDB.
- Backend loại các TMDB ID đã tồn tại trong PostgreSQL.
- Backend validate candidate trước khi trả hoặc lưu.
- Admin có thể xem danh sách rồi quyết định thêm từng phim hoặc danh sách đã chọn.
- Cũng có thể tạo mode tự động thêm các candidate hợp lệ.
- Backend expose option genres/languages cho Admin Scanner; cache ngắn hạn option theo đặc tả gốc.
- UI Admin xem candidate và import nằm ở Phase 7, triển khai sau Phase 6.
- Logic TMDB nằm trong `FetchMovieService` riêng, không sửa `MoviesService`.
- Không cần cast/crew, cache kết quả discover/import, metrics hoặc observability riêng.

## 2. Hành vi bắt buộc

### Luồng Admin xem candidate

1. Admin gọi API discover TMDB.
2. Backend gọi TMDB với filter được chọn.
3. Với từng candidate:
   - validate TMDB ID;
   - loại nếu thiếu poster/backdrop/overview tiếng Anh;
   - gọi movie detail tiếng Anh và tiếng Việt nếu cần;
   - kiểm tra `tmdbId` trong PostgreSQL;
   - loại nếu đã tồn tại.
4. Trả danh sách candidate chưa tồn tại.
5. Không lưu candidate ở bước này.

### Luồng Admin thêm thủ công

- Thêm một `tmdbId`.
- Hoặc thêm nhiều `tmdbIds`.
- Backend kiểm tra lại trùng trong database.
- Chỉ lưu candidate hợp lệ.
- Trả danh sách movie mới đã lưu.

### Luồng tự động

- Có thể thêm method `discoverAndImport(request)`.
- Service tự validate và lưu tất cả candidate hợp lệ trong giới hạn `limit`.
- Không bắt buộc UI bắt buộc dùng mode này.

### 2.4 Load options cho Admin

1. Admin mở Movie Scanner → UI gọi 2 endpoint options của backend.
2. Backend gọi TMDB `/3/genre/movie/list?language=vi-VN` và `/3/configuration/languages`.
3. Backend map/trả option, ưu tiên cache ngắn hạn; không gọi lại TMDB nếu cache còn hạn.
4. UI dùng genre select đơn và language select theo `iso_639_1`.

### 2.5 UI Admin (Phase 7)

1. UI nằm trong trang `/admin/movies`, mở dialog “Lấy phim từ TMDB”.
2. UI gọi discover với filter đã chọn, hiển thị candidate chưa trùng DB.
3. Admin tick chọn candidate rồi gọi import; frontend không gọi thẳng TMDB.
4. Sau import thành công, UI refresh danh sách phim trong DB.

## 3. API

Các endpoint thuộc `MoviesController`, prefix `/api/movies`.

### 3.1. Discover candidate

```http
GET /api/movies/tmdb/discover
Authorization: Bearer <accessToken>
```

Query params:

| Param              | Mô tả                            |
| ------------------ | -------------------------------- |
| `mode`             | `popularity` hoặc `release-year` |
| `page`             | Trang TMDB, bắt đầu từ 1         |
| `limit`            | Số candidate tối đa trả về       |
| `releaseDateFrom`  | Ngày phát hành bắt đầu           |
| `releaseDateTo`    | Ngày phát hành kết thúc          |
| `releaseYearFrom`  | Năm phát hành bắt đầu            |
| `releaseYearTo`    | Năm phát hành kết thúc           |
| `genreIds`         | Danh sách TMDB genre ID          |
| `genreMode`        | `and` hoặc `or`                  |
| `originalLanguage` | Mã ngôn ngữ gốc, ví dụ `ko`      |

Response envelope:

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Lấy danh sách phim mới từ TMDB thành công",
  "result": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 20,
    "totalPages": 1
  }
}
```

`result` chỉ chứa candidate hợp lệ chưa tồn tại trong database.

### 3.2. Thêm một hoặc nhiều candidate

```http
POST /api/movies/tmdb/import
Authorization: Bearer <accessToken>
```

Thêm một:

```json
{
  "tmdbId": 550
}
```

Thêm nhiều:

```json
{
  "tmdbIds": [550, 603]
}
```

Response envelope:

```json
{
  "success": true,
  "statusCode": 201,
  "message": "Thêm phim mới từ TMDB thành công",
  "result": []
}
```

`result` chỉ chứa movie đã lưu thành công.

### 3.3. Tùy chọn tự động thêm

```http
POST /api/movies/tmdb/discover-and-import
Authorization: Bearer <accessToken>
```

Request dùng cùng filter với discover.

Endpoint này có thể tự validate và lưu candidate hợp lệ trong giới hạn `limit`.
UI không bắt buộc dùng endpoint này; Admin có thể dùng luồng discover/import thủ công.

### 3.4. Load options cho UI Admin

```http
GET /api/movies/tmdb/options/genres
GET /api/movies/tmdb/options/languages
Authorization: Bearer <accessToken>
```

Auth: JWT + `@Roles('ADMIN', 'SUPERADMIN')`.

Response `genres`:

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Lấy danh sách thể loại TMDB thành công",
  "result": [{ "id": 28, "name": "Hành động" }]
}
```

Response `languages`:

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Lấy danh sách ngôn ngữ TMDB thành công",
  "result": [
    { "code": "en", "englishName": "English", "name": "English" },
    { "code": "ko", "englishName": "Korean", "name": "한국어" }
  ]
}
```

Mapping TMDB: `iso_639_1 → code`, `english_name → englishName`, `name → name`.
Option list không phân trang; cache ngắn hạn ở backend.

## 4. TMDB API

Chỉ dùng TMDB API v3:

- `GET /3/discover/movie`
- `GET /3/movie/{movie_id}?language=en-US`
- `GET /3/movie/{movie_id}?language=vi-VN`
- `GET /3/genre/movie/list?language=vi-VN`
- `GET /3/configuration/languages`
- Optional `GET /3/movie/{movie_id}/external_ids` nếu cần lưu IMDb ID.

Không gọi `/credits` hoặc `/translations`.
Không lấy hoặc lưu cast/crew.

## 5. Filter TMDB

### Popularity

```text
language=en-US
sort_by=popularity.desc
include_adult=false
include_video=false
page=<page>
primary_release_date.gte=<from>
primary_release_date.lte=<to>
```

### Release year

```text
language=en-US
sort_by=primary_release_date.desc
include_adult=false
include_video=false
page=<page>
primary_release_date.gte=<year>-01-01
primary_release_date.lte=<year>-12-31
with_genres=<genreFilter>
with_original_language=<iso6391>
```

Nếu chọn nhiều năm, xử lý từng khoảng năm và pagination riêng.

## 6. Candidate validation

Candidate hợp lệ khi:

- TMDB ID là số nguyên dương.
- Có `poster_path`.
- Có `backdrop_path`.
- Có overview tiếng Anh.
- Có `title` hoặc `original_title`.
- English detail tồn tại.
- `tmdbId` chưa tồn tại trong PostgreSQL.

Nếu thiếu dữ liệu tiếng Việt:

- `titleVi`/`overviewVi` có thể để rỗng hoặc `null`.
- Không coi missing Vietnamese detail là lỗi candidate.
- Không gọi dữ liệu đó là kết quả dịch AI.

## 7. Kiến trúc backend

Không thêm TMDB logic vào `MoviesService`.

```text
MoviesController
  -> IFetchMovieService
       -> TmdbMovieClient (discover/detail/options)
       -> ICacheService (option genres/languages, TTL ngắn)
       -> IMovieRepository
       -> IGenreRepository
       -> MovieProducer
```

Tạo:

- `backend/src/modules/movies/fetch-movie.service.ts`
- `backend/src/modules/movies/fetch-movie.service.spec.ts` không bắt buộc theo yêu cầu hiện tại
- `backend/src/modules/movies/interfaces/fetch-movie.interface.ts`
- `backend/src/modules/movies/tmdb/tmdb-movie-client.ts`
- `backend/src/modules/movies/tmdb/tmdb-movie.types.ts`
- DTO trong `backend/src/modules/movies/dto/`

Interface đề xuất:

```ts
export const IFetchMovieService = Symbol('IFetchMovieService');

export interface TmdbGenreOption {
  id: number;
  name: string;
}

export interface TmdbLanguageOption {
  code: string;
  englishName: string;
  name: string;
}

export interface IFetchMovieService {
  discover(request: TmdbDiscoverRequestDto): Promise<TmdbMovieCandidate[]>;
  importOne(tmdbId: number): Promise<Movie | null>;
  importMany(tmdbIds: number[]): Promise<Movie[]>;
  discoverAndImport(request: TmdbDiscoverRequestDto): Promise<Movie[]>;
  getGenreOptions(): Promise<TmdbGenreOption[]>;
  getLanguageOptions(): Promise<TmdbLanguageOption[]>;
}
```

## 8. Repository

Thêm vào `IMovieRepository`:

```ts
findByTmdbId(tmdbId: number): Promise<Movie | null>;
```

Quy tắc kiểm tra trùng:

- Mỗi candidate kiểm tra `findByTmdbId` trước khi trả hoặc lưu.
- Khi import cuối cùng kiểm tra lại để tránh race condition.
- Đã tồn tại thì skip.

## 9. Persist

- Dùng `IMovieRepository.create`.
- Map TMDB movie sang `Movie` entity.
- Map TMDB genre sang genre DB.
- Map `origin_country[0]` sang `Country` qua `ICountryRepository.findByCode`; lưu vào relation `Movie.countries`.
- Không thêm migration; TypeORM hiện dùng `synchronize: true`.
- Publish `movie.created` sau khi transaction/repository save thành công.
- Không gọi TMDB HTTP bên trong transaction database.
- Trả movie mới đã lưu cho Admin.

## 10. DTO

Tạo:

- `TmdbDiscoverRequestDto`
- `TmdbImportRequestDto`

Quy tắc validation:

- `mode` chỉ nhận giá trị hợp lệ.
- `page >= 1`.
- `limit 1..100`.
- year/release date range hợp lệ.
- `genreIds` là number dương.
- `genreMode=and|or`.
- `originalLanguage` là chuỗi 2 ký tự ISO khi có.
- Whitelist query/body; field không hợp lệ bị reject.

## 11. Env

Thêm:

- `TMDB_API_TOKEN`
- `TMDB_API_BASE_URL` optional, mặc định `https://api.themoviedb.org/3`
- `TMDB_HTTP_TIMEOUT_MS` optional, mặc định `10000`

Không commit TMDB token.
Không log Authorization header hoặc bearer token.

## 12. Phases

### Phase 1 — Service & contract

- [x] Chốt query/response discover.
- [x] Chốt import một/nhiều candidate.
- [x] Thêm env TMDB.
- [x] Tạo `IFetchMovieService`.
- [x] Tạo `TmdbMovieClient`.
- [x] Thêm `findByTmdbId`.

### Phase 2 — Discover

- [x] Thêm `GET /api/movies/tmdb/discover`.
- [x] Implement filter popularity/release-year.
- [x] Validate candidate.
- [x] Loại TMDB ID đã tồn tại.
- [x] Trả candidate chưa tồn tại.

### Phase 3 — Import thủ công

- [x] Thêm `POST /api/movies/tmdb/import`.
- [x] Import một hoặc nhiều TMDB ID.
- [x] Kiểm tra trùng lần cuối.
- [x] Persist movie và genre.
- [x] Publish `movie.created` sau commit.
- [x] Trả movie đã lưu.

### Phase 4 — Tùy chọn tự động

- [x] Thêm `discoverAndImport`.
- [x] Thêm endpoint `discover-and-import`.
- [x] Giới hạn candidate theo `limit`.

### Phase 5 — Hoàn thiện endpoint cũ

- [x] Cập nhật Swagger cho discover/import/discover-and-import (`ApiPropertyOptional` trên DTO; `ApiOperation`/`ApiBody`/`ApiOkResponse`/`ApiCreatedResponse` trên controller).
- [x] Cập nhật `docs/BACKEND.md`.
- [x] Chạy type-check/build và test controller hiện có.

### Phase 6 — Load options backend (bổ sung 2026-11-24)

- [x] Thêm `TmdbGenreOption`, `TmdbLanguageOption` vào `tmdb-movie.types.ts`.
- [x] Thêm `getGenres(language = 'vi-VN')` và `getLanguages()` vào `TmdbMovieClient`.
- [x] Thêm `getGenreOptions()` / `getLanguageOptions()` vào `IFetchMovieService` và `FetchMovieService`.
- [x] Cache option qua `ICacheService` hiện hữu: `tmdb:options:genres`, `tmdb:options:languages`; TTL 24h; cache lỗi thì fallback gọi TMDB.
- [x] Thêm `GET /api/movies/tmdb/options/genres` và `GET /api/movies/tmdb/options/languages` vào `MoviesController` (JWT + ADMIN/SUPERADMIN).
- [x] Cập nhật Swagger cho 2 endpoint options.
- [x] Cập nhật `docs/BACKEND.md` với 2 endpoint mới.
- [x] Chạy type-check/build + test controller hiện có (460 tests passed).
- [x] Check auth scheme: token dạng JWT dùng `Authorization: Bearer`, API key v3 dùng query `api_key`; không gửi cả hai cùng lúc.
- [ ] Smoke runtime với TMDB token hợp lệ (cần token thật; `.env.example` chỉ placeholder).

### Phase 7 — Admin UI trong `/admin/movies` (triển khai 2026-11-24)

- [x] Thêm nút “Lấy phim từ TMDB” vào `toolbarActions` của `movies-client.tsx`.
- [x] Dialog load option từ 2 endpoint Phase 6; frontend không gọi thẳng TMDB.
- [x] Filter: mode, page/limit, ngày/năm, **genre select đơn**, **language select**.
  - Genre: “Tất cả” → không gửi `genreIds`; chọn 1 genre → gửi `genreIds: [id]`.
  - Language: label = `name || englishName`, value = `code`.
- [x] Discover → grid candidate (poster/phân trang) → tick chọn (`aria-pressed`) → `POST /tmdb/import`.
- [x] Sau import: toast + invalidate `adminMovies` + dọn selection + refetch discover.
- [x] Không dùng `discover-and-import` trừ khi được yêu cầu.
- [x] QA responsive/dark mode/a11y theo rules + chạy type-check/lint/test/build frontend (37 files / 286 tests; lint 0 error). Chưa QA browser thủ công.

File liên quan: `frontend/src/apis/movie.api.ts`, `frontend/src/hooks/tankstack/tmdb.ts`, `frontend/src/app/(admin-layout)/admin/movies/tmdb-scanner-dialog.tsx`, `frontend/src/app/(admin-layout)/admin/movies/movies-client.tsx`.

## 13. Ngoài phạm vi

- Không lấy cast/crew.
- Không gọi `/credits` hoặc `/translations`.
- Không viết test mới làm mục tiêu chính của plan.
- Không cache kết quả discover/import/candidate; option genres/languages được cache ngắn hạn theo đặc tả gốc.
- Không thêm metrics/observability riêng.
- Không triển khai UI trong đợt bổ sung backend này; UI nằm Phase 7 của plan này.
- Không commit/push nếu chưa được yêu cầu.

## Đặc tả yêu cầu gốc

Dưới đây là danh sách API và cách sử dụng chính xác cho tính năng **Movie Scanner**. Chỉ sử dụng TMDB API v3.

### **1. Danh sách API sử dụng**

| API                              | Method | Mục đích                                    |
| -------------------------------- | ------ | ------------------------------------------- |
| `/discover/movie`                | GET    | Quét phim theo popularity hoặc release year |
| `/genre/movie/list`              | GET    | Load danh sách thể loại                     |
| `/configuration/languages`       | GET    | Load danh sách ngôn ngữ                     |
| `/movie/{movie_id}`              | GET    | Lấy metadata chi tiết                       |
| `/movie/{movie_id}/translations` | GET    | Lấy bản dịch phim                           |
| `/movie/{movie_id}/credits`      | GET    | Lấy cast và crew                            |
| `/movie/{movie_id}/external_ids` | GET    | Lấy IMDb ID và external IDs                 |

Tài liệu: [TMDB API Reference](https://developer.themoviedb.org/reference/getting-started?utm_source=chatgpt.com).

### **2. Load options cho giao diện Admin**

Đây là các API gọi khi mở trang Movie Scanner.

**A. Load genres**

```
GET /3/genre/movie/list?language=vi-VN
```

Response:

```
{
  "genres": [
    { "id": 28, "name": "Hành động" },
    { "id": 12, "name": "Phiêu lưu" },
    { "id": 16, "name": "Hoạt hình" },
    { "id": 18, "name": "Chính kịch" },
    { "id": 27, "name": "Kinh dị" },
    { "id": 878, "name": "Khoa học viễn tưởng" }
  ]
}
```

**B. Load languages**

```
GET /3/configuration/languages
```

Response:

```
[
  {
    "iso_639_1": "en",
    "english_name": "English",
    "name": "English"
  },
  {
    "iso_639_1": "ko",
    "english_name": "Korean",
    "name": "한국어"
  },
  {
    "iso_639_1": "ja",
    "english_name": "Japanese",
    "name": "日本語"
  }
]
```

Hai API này nên được cache trong Redis hoặc cache phía backend, không cần gọi mỗi lần người dùng mở trang.

Nguồn: [TMDB Configuration](https://developer.themoviedb.org/docs/getting-started?utm_source=chatgpt.com).

### **3. API quét phim – Popularity Scanner**

```
GET /3/discover/movie
```

Parameters:

| Parameter                  | Giá trị           |
| -------------------------- | ----------------- |
| `language`                 | `en-US`           |
| `sort_by`                  | `popularity.desc` |
| `primary_release_date.gte` | `1990-01-01`      |
| `primary_release_date.lte` | Ngày hiện tại     |
| `include_adult`            | `false`           |
| `include_video`            | `false`           |
| `page`                     | 1, 2, 3...        |

Ví dụ:

```
GET /3/discover/movie?language=en-US&sort_by=popularity.desc&primary_release_date.gte=1990-01-01&primary_release_date.lte=2026-11-20&include_adult=false&include_video=false&page=1
```

Response:

```
{
  "page": 1,
  "total_pages": 500,
  "total_results": 10000,
  "results": [
    {
      "id": 550,
      "title": "Fight Club",
      "original_title": "Fight Club",
      "original_language": "en",
      "overview": "A ticking-time-bomb insomniac...",
      "release_date": "1999-10-15",
      "genre_ids": [18, 53],
      "popularity": 80.5,
      "vote_average": 8.4,
      "vote_count": 29000,
      "poster_path": "/poster.jpg",
      "backdrop_path": "/backdrop.jpg"
    }
  ]
}
```

Bạn lấy `id` từ `results` để chuyển sang bước lấy metadata chi tiết.

[image](https://www.google.com/s2/favicons?domain=https://developer.themoviedb.org&sz=32)

The Movie Database (TMDB)

### **4. API quét phim – Release Year Scanner**

Cũng sử dụng `/discover/movie`, chỉ thay đổi parameters.

Ví dụ chọn:

- Năm 2025.
- Genre Action và Sci-Fi.
- Original language Korean.
- Lấy phim mới trước.

```
GET /3/discover/movie
```

Parameters:

```
language=en-US

primary_release_date.gte=2025-01-01
primary_release_date.lte=2025-12-31

with_genres=28|878
with_original_language=ko

sort_by=primary_release_date.desc

include_adult=false
include_video=false
page=1
```

Một số lưu ý:

- `with_genres=28,878`: AND.
- `with_genres=28|878`: OR.
- `with_original_language=ko`: chỉ phim có ngôn ngữ gốc tiếng Hàn.
- Không đặt `vote_count.gte` mặc định.

Khi người dùng chọn nhiều năm, backend chia thành từng khoảng năm và chạy pagination riêng.

[image](https://www.google.com/s2/favicons?domain=https://developer.themoviedb.org&sz=32)

The Movie Database (TMDB)

### **5. Lấy metadata tiếng Anh và tiếng Việt**

Sau khi lấy được `movie_id`, gọi:

**A. English detail**

```
GET /3/movie/550?language=en-US
```

**B. Vietnamese detail**

```
GET /3/movie/550?language=vi-VN
```

Response rút gọn:

```
{
  "id": 550,
  "title": "Fight Club",
  "original_title": "Fight Club",
  "overview": "...",
  "release_date": "1999-10-15",
  "runtime": 139,
  "genres": [
    {
      "id": 18,
      "name": "Drama"
    }
  ],
  "poster_path": "/poster.jpg",
  "backdrop_path": "/backdrop.jpg"
}
```

Lưu hai response vào cùng một movie:

```
{
  "tmdb_id": 550,
  "title": "Fight Club",
  "title_vi": "Sàn Đấu Sinh Tử",
  "overview": "...",
  "overview_vi": "..."
}
```

Lưu ý: Bản dịch tiếng Việt có thể không tồn tại. Phải kiểm tra dữ liệu thực tế thay vì mặc định response `vi-VN` luôn có bản dịch.

[image](https://www.google.com/s2/favicons?domain=https://developer.themoviedb.org&sz=32)

The Movie Database (TMDB)+1

### **6. API lấy danh sách bản dịch**

Nếu muốn kiểm tra bản dịch có sẵn:

```
GET /3/movie/550/translations
```

Response có dạng:

```
{
  "id": 550,
  "translations": [
    {
      "iso_3166_1": "US",
      "iso_639_1": "en",
      "name": "English",
      "english_name": "English",
      "data": {
        "title": "Fight Club",
        "overview": "...",
        "homepage": ""
      }
    },
    {
      "iso_3166_1": "VN",
      "iso_639_1": "vi",
      "name": "Tiếng Việt",
      "english_name": "Vietnamese",
      "data": {
        "title": "Sàn Đấu Sinh Tử",
        "overview": "..."
      }
    }
  ]
}
```

Có thể dùng API này để lấy bản dịch `vi` và `en`, nhưng cần chọn đúng locale và kiểm tra trường dữ liệu rỗng.

### **7. Tóm tắt luồng API cần triển khai**

1. **Load options**

   `/genre/movie/list`

   `/configuration/languages`

2. **Discovery**

   `/discover/movie`

   Chọn Popularity hoặc Release Year.

3. **Candidate processing**

   Lấy `results[].id`, kiểm tra trùng, Max Collect và Max Save.

4. **Metadata**

   `/movie/{id}?language=en-US`

   `/movie/{id}?language=vi-VN`

5. **Enrichment**

   `/movie/{id}/credits`

   `/movie/{id}/external_ids`

6. **Persist**

   PostgreSQL upsert movie và các quan hệ.

**Tôi khuyên dùng&#x20;**`append_to_response` để gộp credits và external IDs vào request detail tiếng Anh khi phù hợp:

```
GET /3/movie/550?language=en-US&append_to_response=credits,external_ids
```

Nó giúp giảm số HTTP round trips; mỗi phần dữ liệu được trả về trong cùng response JSON.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://developer.themoviedb.org&sz=32)

The Movie Database (TMDB)

Tài liệu endpoint: [Discover Movie](https://developer.themoviedb.org/reference/discover-movie?utm_source=chatgpt.com) · [Movie Genres](https://developer.themoviedb.org/reference/genre-movie-list?utm_source=chatgpt.com) · [Languages](https://developer.themoviedb.org/docs/languages?utm_source=chatgpt.com).
