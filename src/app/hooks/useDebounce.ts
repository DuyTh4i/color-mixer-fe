import { useState, useEffect } from "react";

/**
 * Trì hoãn cập nhật giá trị cho đến khi không có thay đổi nào trong `delay` ms.
 * Dùng để tránh gọi API liên tục khi người dùng rê chuột / chạm liên tục.
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // Đặt timer: sau delay ms không có thay đổi mới thì mới cập nhật
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Nếu value thay đổi trước khi timer kết thúc, hủy timer cũ
    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}