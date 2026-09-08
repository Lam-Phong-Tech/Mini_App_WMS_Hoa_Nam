/**
 * Màn kiểm tra Keyboard Wedge.
 *
 * Dùng khi có PDA thật để đo suffix và hành vi đầu quét — chính là dữ liệu mà
 * GATE_PDA_HARDWARE_CERTIFICATION đang chờ. Không phải màn nghiệp vụ.
 *
 * 🔴 Suffix mặc định ở đây là `Enter` + `Tab`; đó CHỈ là mặc định local/test,
 * không phải suffix của PDA production (spec scanner §3.1).
 */

import React, { useCallback, useMemo, useState } from 'react';

import { Page } from '../../ui/Page';
import { Box } from '../../ui/Box';
import { Text } from '../../ui/Text';
import { CodeInput } from '../../ui/CodeInput';
import { Button } from '../../ui/Button';
import { List } from '../../ui/List';
import { useKeyboardWedge } from '../../scanner/useKeyboardWedge';
import type { ScanDetectedResult } from '../../scanner/types';
import type { WedgeParserConfig } from '../../scanner/keyboardWedge';

export function ScanTestScreen(): React.ReactElement {
  const [enabled, setEnabled] = useState(true);
  const [results, setResults] = useState<ScanDetectedResult[]>([]);

  const config = useMemo<Partial<WedgeParserConfig>>(
    () => ({
      suffixes: ['ENTER', 'TAB'],
      // Bật timeout để thử thiết bị không gửi suffix. Giá trị thật phải đo trên
      // máy thật rồi chốt ở Gate phần cứng.
      endOfScanTimeoutMs: 120,
      minCodeLength: 1,
      dedupeWindowMs: 0,
      stripControlCharacters: true,
    }),
    [],
  );

  const handleScan = useCallback((result: ScanDetectedResult) => {
    setResults(previous => [result, ...previous].slice(0, 100));
  }, []);

  const wedge = useKeyboardWedge({ enabled, onScan: handleScan, config });

  return (
    <Page title="Kiểm tra đầu quét" scroll={false}>
      <Box card padding="lg" gap="md">
        <Text variant="caption" tone="muted">
          Đặt con trỏ vào ô dưới rồi bắn mã bằng đầu quét của PDA. Mỗi lần bắn
          phải sinh đúng một dòng kết quả.
        </Text>

        <CodeInput
          label="Vùng nhận ký tự từ đầu quét"
          value={wedge.value}
          onChangeText={wedge.onChangeText}
          onSubmitEditing={wedge.onSubmitEditing}
          blurOnSubmit={false}
          editable={enabled}
          placeholder={enabled ? 'Sẵn sàng nhận' : 'Đang tắt'}
          helperText={'Trạng thái nguồn: ' + wedge.sourceState}
        />

        <Button
          label={enabled ? 'Tắt listener' : 'Bật listener'}
          variant="secondary"
          onPress={() => setEnabled(current => !current)}
        />
      </Box>

      <Box row justify="space-between" align="center">
        <Text variant="cardTitle" tone="strong">
          Đã nhận: {results.length}
        </Text>
        {results.length > 0 ? (
          <Button
            label="Xoá"
            variant="secondary"
            onPress={() => setResults([])}
          />
        ) : null}
      </Box>

      <Box flex={1}>
        <List
          data={results}
          keyExtractor={(item, index) => item.detectedAt + '#' + String(index)}
          emptyText="Chưa nhận được mã nào."
          renderItem={item => (
            <Box paddingY="md" gap="xs">
              <Text variant="body" tone="strong">
                {item.code}
              </Text>
              <Text variant="caption" tone="muted">
                {item.source} · {item.detectedAt}
              </Text>
            </Box>
          )}
        />
      </Box>
    </Page>
  );
}
