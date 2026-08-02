/**
 * 原地保留符合条件的数组项，避免 Array#filter 在大响应上同时保留
 * 新旧两份数组。
 */
export function retainInPlace(items, keep) {
  let write = 0;
  for (let read = 0; read < items.length; read++) {
    const item = items[read];
    if (keep(item, read)) items[write++] = item;
  }
  items.length = write;
  return items;
}
