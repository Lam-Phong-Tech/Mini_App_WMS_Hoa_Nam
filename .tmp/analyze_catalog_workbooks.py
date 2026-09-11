from collections import Counter
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET
import json
import re

NS = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main", "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}

WORKBOOKS = [
    Path(r"C:\laragon\www\zalo_mini_app\tool\outputs\filled_r2_links_20260906\DongCheng_PowerTools_2026_filled_r2_links.xlsx"),
    Path(r"C:\laragon\www\zalo_mini_app\tool\outputs\filled_r2_links_20260906\DongCheng_Handtools_2026_filled_r2_links.xlsx"),
]

def col_index(cell_ref: str) -> int:
    letters = re.match(r"([A-Z]+)", cell_ref).group(1)
    value = 0
    for character in letters:
        value = value * 26 + (ord(character) - 64)
    return value - 1

def text_at(cell, shared):
    cell_type = cell.get("t")
    value = cell.find("x:v", NS)
    if cell_type == "s" and value is not None:
        return shared[int(value.text)]
    if cell_type == "inlineStr":
        return "".join(cell.itertext())
    return value.text if value is not None else ""

def read_sheet(archive, target, shared):
    root = ET.fromstring(archive.read(target))
    output = []
    for row in root.findall(".//x:sheetData/x:row", NS):
        values = {}
        for cell in row.findall("x:c", NS):
            values[col_index(cell.get("r"))] = text_at(cell, shared).strip()
        if values:
            output.append([values.get(index, "") for index in range(max(values) + 1)])
    return output

def normalize(text):
    return re.sub(r"\s+", " ", str(text or "").strip())

def find_column(headers, patterns):
    lower = [normalize(item).lower() for item in headers]
    for pattern in patterns:
        for index, item in enumerate(lower):
            if pattern in item:
                return index
    return None

def values(rows, index):
    return [normalize(row[index]) if index is not None and index < len(row) else "" for row in rows]

def report_workbook(path):
    with ZipFile(path) as archive:
        shared = []
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            shared = ["".join(node.itertext()) for node in root.findall("x:si", NS)]
        workbook_root = ET.fromstring(archive.read("xl/workbook.xml"))
        rel_root = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        targets = {rel.get("Id"): rel.get("Target") for rel in rel_root}
        sheets = []
        for sheet in workbook_root.findall(".//x:sheets/x:sheet", NS):
            relationship_id = sheet.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
            target = targets[relationship_id]
            if not target.startswith("xl/") and not target.startswith("/"):
                target = f"xl/{target.lstrip('/')}"
            else:
                target = target.lstrip("/")
            rows = read_sheet(archive, target, shared)
            if not rows:
                sheets.append({"name": sheet.get("name"), "rows": 0, "headers": []})
                continue
            headers = rows[0]
            data = rows[1:]
            columns = {
                "sku": find_column(headers, ["mã sku", "sku", "mã sản phẩm", "product code"]),
                "name": find_column(headers, ["tên sản phẩm", "tên hàng", "product name", "tên máy"]),
                "category": find_column(headers, ["danh mục", "nhóm sản phẩm", "category"]),
                "family": find_column(headers, ["chủng loại", "product family", "family"]),
                "brand": find_column(headers, ["thương hiệu", "brand"]),
                "description": find_column(headers, ["mô tả", "description"]),
                "specifications": find_column(headers, ["thông số", "specification"]),
                "power_source": find_column(headers, ["nguồn điện", "power source"]),
                "media": find_column(headers, ["link ảnh", "image url", "media url", "r2"]),
                "feature": find_column(headers, ["tính năng", "feature"]),
                "package": find_column(headers, ["đóng gói", "package"]),
            }
            sku_values = values(data, columns["sku"])
            media_values = values(data, columns["media"])
            category_values = values(data, columns["category"])
            family_values = values(data, columns["family"])
            source_values = values(data, columns["power_source"])
            report = {
                "name": sheet.get("name"),
                "rows": len(data),
                "headers": headers,
                "mapped_columns": {key: headers[index] if index is not None else None for key, index in columns.items()},
                "counts": {
                    "sku_blank": sum(not item for item in sku_values),
                    "sku_unique": len(set(item for item in sku_values if item)),
                    "sku_duplicates": sorted([item for item, count in Counter(item for item in sku_values if item).items() if count > 1])[:30],
                    "media_blank": sum(not item for item in media_values),
                    "media_https": sum(item.startswith("https://") for item in media_values),
                    "media_non_https_sample": [item for item in media_values if item and not item.startswith("https://")][:8],
                    "categories": Counter(item for item in category_values if item).most_common(),
                    "families_count": len(set(item for item in family_values if item)),
                    "power_sources": Counter(item for item in source_values if item).most_common(),
                },
                "samples": [
                    {headers[index]: row[index] if index < len(row) else "" for index in range(min(len(headers), len(row)))}
                    for row in data[:3]
                ],
            }
            sheets.append(report)
    return {"file": path.name, "sheets": sheets}

print(json.dumps([report_workbook(path) for path in WORKBOOKS], ensure_ascii=False, indent=2))
