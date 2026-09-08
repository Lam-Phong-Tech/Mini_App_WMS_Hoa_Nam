/**
 * Theme provider.
 *
 * Chỉ có một bộ token sáng — Mini App nguồn cũng chỉ định nghĩa một bộ trong
 * `:root`, không có biến thể tối. Không tự bịa bảng màu tối (Prompt 2 §3:
 * "không tự sáng tạo lại nhận diện thương hiệu").
 */

import React, { createContext, useContext, type ReactNode } from 'react';
import { tokens, type Tokens } from './tokens';

const ThemeContext = createContext<Tokens>(tokens);

export function ThemeProvider({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  return (
    <ThemeContext.Provider value={tokens}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): Tokens {
  return useContext(ThemeContext);
}
