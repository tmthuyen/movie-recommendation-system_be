import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chatApi } from '@/apis/chat.api';
import { useChatStore } from '@/stores/chat.store';
import { ChatWidget } from './chat-widget';

vi.mock('@/apis/chat.api', () => ({
  chatApi: {
    ask: vi.fn(),
  },
}));

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe('ChatWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useChatStore.getState().closeChat();
    useChatStore.getState().clearMessages();
  });

  it('hiển thị nút tròn góc dưới phải và mở khung chat khi nhấn vào', () => {
    renderWithQuery(<ChatWidget />);

    const openBtn = screen.getByRole('button', { name: 'Mở trợ lý phim AI' });
    expect(openBtn).toBeInTheDocument();

    fireEvent.click(openBtn);

    expect(screen.getByText('Trợ lý điện ảnh AI')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('Nhập câu hỏi tìm phim...'),
    ).toBeInTheDocument();
  });

  it('phóng to khung chat ra giữa màn hình và thu nhỏ lại khi nhấn nút toggle phóng to', async () => {
    renderWithQuery(<ChatWidget />);

    fireEvent.click(screen.getByRole('button', { name: 'Mở trợ lý phim AI' }));

    const maximizeBtn = screen.getByRole('button', {
      name: 'Phóng to ở giữa màn hình',
    });
    expect(maximizeBtn).toBeInTheDocument();

    // Nhấn phóng to
    fireEvent.click(maximizeBtn);

    expect(
      screen.getByRole('dialog', {
        name: 'Khung chat trợ lý phim AI phóng to',
      }),
    ).toBeInTheDocument();

    const minimizeBtn = screen.getByRole('button', {
      name: 'Thu nhỏ về góc màn hình',
    });
    expect(minimizeBtn).toBeInTheDocument();

    // Nhấn thu nhỏ lại
    fireEvent.click(minimizeBtn);

    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', {
          name: 'Khung chat trợ lý phim AI phóng to',
        }),
      ).not.toBeInTheDocument();
    });

    expect(
      screen.getByRole('button', { name: 'Phóng to ở giữa màn hình' }),
    ).toBeInTheDocument();
  });

  it('gửi câu hỏi và hiển thị câu trả lời cùng danh sách phim gợi ý', async () => {
    vi.mocked(chatApi.ask).mockResolvedValueOnce({
      success: true,
      statusCode: 200,
      message: 'Thành công',
      result: {
        answer: 'Tôi gợi ý cho bạn bộ phim Người Nhện rất hấp dẫn.',
        movies: [
          {
            id: 109991,
            title: 'Spider-Man',
            titleVi: 'Người Nhện',
            releaseDate: '2002-05-01',
            voteAverage: 7.8,
            similarityScore: 0.92,
            rank: 1,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            createdBy: 'system',
            updatedAt: new Date('2026-01-01T00:00:00.000Z'),
            updatedBy: 'system',
          },
        ],
      },
    });

    renderWithQuery(<ChatWidget />);
    fireEvent.click(screen.getByRole('button', { name: 'Mở trợ lý phim AI' }));

    const input = screen.getByPlaceholderText('Nhập câu hỏi tìm phim...');
    fireEvent.change(input, { target: { value: 'Tìm phim siêu anh hùng' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi tin nhắn' }));

    await waitFor(() => {
      expect(
        screen.getByText('Tôi gợi ý cho bạn bộ phim Người Nhện rất hấp dẫn.'),
      ).toBeInTheDocument();
    });

    expect(screen.getByRole('link', { name: 'Người Nhện' })).toHaveAttribute(
      'href',
      '/movies/109991',
    );
  });

  it('hiển thị thông báo lỗi và nút Thử lại khi API gặp sự cố', async () => {
    vi.mocked(chatApi.ask).mockRejectedValueOnce(new Error('Network error'));

    renderWithQuery(<ChatWidget />);
    fireEvent.click(screen.getByRole('button', { name: 'Mở trợ lý phim AI' }));

    const input = screen.getByPlaceholderText('Nhập câu hỏi tìm phim...');
    fireEvent.change(input, { target: { value: 'Phim hành động' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi tin nhắn' }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Thử lại' }),
      ).toBeInTheDocument();
    });
  });
});
