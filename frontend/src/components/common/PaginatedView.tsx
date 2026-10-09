import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';

interface PaginatedViewProps<T> {
  data: T[];
  itemsPerPage?: number;
  renderContent: (paginatedData: T[]) => React.ReactNode;
  resetDependency?: any; // To reset page to 1 when a filter changes
}

export function PaginatedView<T>({ 
  data, 
  itemsPerPage = 5, 
  renderContent,
  resetDependency
}: PaginatedViewProps<T>) {
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.ceil(data.length / itemsPerPage);
  
  const paginatedData = data.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [resetDependency]);

  return (
    <div className="w-full">
      {/* Nơi render danh sách dạng Card hoặc Table */}
      {renderContent(paginatedData)}

      {/* Điều khiển phân trang */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between pt-4 border-t border-gray-100 dark:border-slate-700/50 mt-6 gap-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Hiển thị <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> đến <span className="font-medium">{Math.min(currentPage * itemsPerPage, data.length)}</span> trong <span className="font-medium">{data.length}</span> kết quả
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="bg-white dark:bg-slate-800"
            >
              Trước
            </Button>
            <div className="flex items-center px-3 text-sm font-medium text-gray-700 dark:text-gray-300">
              Trang {currentPage} / {totalPages}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="bg-white dark:bg-slate-800"
            >
              Sau
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
