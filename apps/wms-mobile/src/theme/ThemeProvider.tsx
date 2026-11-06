/**
 * Theme provider.
 *
 * Chỉ có một bộ token sáng — Mini App nguồn cũng chỉ định nghĩa một bộ trong
 * `:root`, không có biến thể tối. Không tự bịa bảng màu tối (Prompt 2 §3:
 * "không tự sáng tạo lại nhận diện thương hiệu").
 */

import React, { createContext, useContext, useMemo, type ReactNode } from 'react';
import { tokens, type Tokens } from './tokens';

const ThemeContext = createContext<Tokens>(tokens);

export function ThemeProvider({
  children,
  fontFamily,
}: {
  children: ReactNode;
  fontFamily?: string;
}): ReactNode {
  const resolvedFont=fontFamily&&['Public Sans','Arial','Arimo'].includes(fontFamily)?'Inter':fontFamily;
  const value=useMemo(()=>resolvedFont
    ? {...tokens,typography:{...tokens.typography,fontFamily:resolvedFont}}
    : tokens,[resolvedFont]);
  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): Tokens {
  return useContext(ThemeContext);
}
