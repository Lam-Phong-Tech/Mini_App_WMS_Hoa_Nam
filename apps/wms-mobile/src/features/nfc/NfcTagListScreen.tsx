import React, { useCallback, useEffect, useState } from 'react';
import { Banner } from '../../ui/Banner';
import { Box } from '../../ui/Box';
import { Button } from '../../ui/Button';
import { DefinitionRow } from '../../ui/DefinitionRow';
import { EmptyState } from '../../ui/EmptyState';
import { FilterChipRow } from '../../ui/FilterChipRow';
import { Input } from '../../ui/Input';
import { Page } from '../../ui/Page';
import { Sheet } from '../../ui/Sheet';
import { Text } from '../../ui/Text';
import { messageForUser, toAppError, type AppError } from '../../errors/AppError';
import { deactivateNfcTag, listNfcTags, type NfcTag } from '../../services/wms/nfc';

const FILTERS = [{ key: 'all', label: 'Tất cả' }, { key: 'ACTIVE', label: 'Đang dùng' }, { key: 'INACTIVE', label: 'Ngừng dùng' }, { key: 'LOST', label: 'Thất lạc' }, { key: 'DAMAGED', label: 'Hỏng' }] as const;
const DEACTIVATION = [{ key: 'INACTIVE', label: 'Ngừng dùng' }, { key: 'LOST', label: 'Thất lạc' }, { key: 'DAMAGED', label: 'Hỏng' }] as const;

export interface NfcTagListScreenProps { onBack: () => void; }
export function NfcTagListScreen({ onBack }: NfcTagListScreenProps): React.ReactElement {
  const [filter, setFilter] = useState('all'); const [tags, setTags] = useState<readonly NfcTag[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState<AppError>();
  const [selected, setSelected] = useState<NfcTag>(); const [reason, setReason] = useState(''); const [status, setStatus] = useState<'INACTIVE' | 'LOST' | 'DAMAGED'>('INACTIVE'); const [saving, setSaving] = useState(false);
  const load = useCallback(async () => { setLoading(true); setError(undefined); try { setTags((await listNfcTags({ status: filter === 'all' ? undefined : filter, per_page: 50 })).items); } catch (cause) { setError(toAppError(cause)); } finally { setLoading(false); } }, [filter]);
  useEffect(() => { load().catch(() => undefined); }, [load]);
  const deactivate = async (): Promise<void> => { const id = selected?.physical_code_id ?? selected?.id; if (id === undefined || reason.trim() === '' || saving) return; setSaving(true); try { await deactivateNfcTag(id, { status, reason: reason.trim() }); setSelected(undefined); setReason(''); await load(); } catch (cause) { setError(toAppError(cause)); } finally { setSaving(false); } };
  return <Page title="Danh sách chip NFC" subtitle="Theo dõi và thu hồi chip đã gán" onBack={onBack} scroll>
    <Banner tone="info" title="Thu hồi giữ lại audit" message="Ngừng dùng, báo mất hoặc hỏng không xoá dữ liệu mapping; hệ thống lưu trạng thái và lý do để truy vết." />
    <FilterChipRow chips={FILTERS} activeKey={filter} onSelect={setFilter} />
    {error === undefined ? null : <Banner tone="danger" title="Không tải được chip NFC" message={messageForUser(error)}><Button label="Thử lại" variant="secondary" onPress={load} /></Banner>}
    {loading ? <Text variant="caption" tone="muted">Đang tải chip NFC…</Text> : tags.length === 0 ? <EmptyState title="Chưa có chip NFC" hint="Không có chip khớp bộ lọc hiện tại." /> : tags.map(tag => <Box key={tag.physical_code_id ?? tag.id ?? tag.hardware_uid} card padding="lg" gap="sm"><Text variant="cardTitle" tone="strong">{tag.code_value ?? tag.hardware_uid ?? 'Chip NFC'}</Text><DefinitionRow label="UID" value={tag.hardware_uid} /><DefinitionRow label="Trạng thái" value={tag.status} /><DefinitionRow label="Item / serial" value={tag.item?.serial_number ?? tag.item?.serial ?? tag.item?.item_unique} /><DefinitionRow label="SKU" value={tag.item?.sku_code ?? tag.sku?.sku_code} last />{tag.status === 'ACTIVE' && (tag.physical_code_id ?? tag.id) !== undefined ? <Button label="Thu hồi chip" variant="secondary" onPress={() => setSelected(tag)} /> : null}</Box>)}
    <Sheet visible={selected !== undefined} onDismiss={() => { if (!saving) setSelected(undefined); }} title="Thu hồi chip NFC" message="Chọn trạng thái và ghi rõ lý do. Chip sẽ không còn dùng để tra cứu/gán nhưng audit vẫn được giữ.">
      <FilterChipRow chips={DEACTIVATION} activeKey={status} onSelect={value => setStatus(value as 'INACTIVE' | 'LOST' | 'DAMAGED')} />
      <Input label="Lý do thu hồi" value={reason} onChangeText={setReason} placeholder="Ví dụ: thẻ bong khỏi sản phẩm" />
      <Button label="Xác nhận thu hồi" variant="danger" loading={saving} disabled={saving || reason.trim() === ''} onPress={deactivate} />
      <Button label="Huỷ" variant="secondary" disabled={saving} onPress={() => setSelected(undefined)} />
    </Sheet>
  </Page>;
}
