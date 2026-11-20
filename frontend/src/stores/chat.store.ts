import { create } from 'zustand';
import { ChatMessage } from '@/shared/types/chat.types';

const INITIAL_WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome-message',
  role: 'assistant',
  content:
    'Xin chào! Tôi là trợ lý Moviere AI. Bạn muốn tìm phim theo thể loại, cốt truyện hay cảm xúc nào hôm nay?',
  createdAt: new Date(0).toISOString(),
};

let messageSeq = 0;

export type NewChatMessageInput = Omit<ChatMessage, 'id' | 'createdAt'> & {
  id?: string;
  createdAt?: string;
};

interface ChatState {
  isOpen: boolean;
  isExpanded: boolean;
  messages: ChatMessage[];
  openChat: () => void;
  closeChat: () => void;
  toggleChat: () => void;
  toggleExpand: () => void;
  setExpanded: (expanded: boolean) => void;
  addMessage: (message: NewChatMessageInput) => void;
  updateMessage: (id: string, updates: Partial<ChatMessage>) => void;
  clearMessages: () => void;
}

/** Store trạng thái khung chat trợ lý phim AI. */
export const useChatStore = create<ChatState>((set) => ({
  isOpen: false,
  isExpanded: false,
  messages: [INITIAL_WELCOME_MESSAGE],
  openChat: () => set({ isOpen: true }),
  closeChat: () => set({ isOpen: false, isExpanded: false }),
  toggleChat: () =>
    set((state) => ({
      isOpen: !state.isOpen,
      isExpanded: !state.isOpen ? false : state.isExpanded,
    })),
  toggleExpand: () => set((state) => ({ isExpanded: !state.isExpanded })),
  setExpanded: (isExpanded) => set({ isExpanded }),
  addMessage: (input) =>
    set((state) => {
      messageSeq += 1;
      const nextMessage: ChatMessage = {
        ...input,
        id: input.id ?? `${input.role}-${Date.now()}-${messageSeq}`,
        createdAt: input.createdAt ?? new Date().toISOString(),
      };
      return { messages: [...state.messages, nextMessage] };
    }),
  updateMessage: (id, updates) =>
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === id ? { ...msg, ...updates } : msg,
      ),
    })),
  clearMessages: () => set({ messages: [INITIAL_WELCOME_MESSAGE] }),
}));
