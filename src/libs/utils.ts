/**
 * Function to slice an array given a limit and offset
 * @param array input array
 * @param limit how many records to return
 * @param offset offset to discard elements
 * @returns sliced array or empty if input is null or has length = 0 or even if the params (limit/offset) exceeds the array length
 */
export function limitOffset<T>(array: T[], limit: string, offset: string): T[] {
  if (!array) return [];

  const $limit = parseInt(limit, 10);
  const $offset = parseInt(offset, 10);

  const length = array.length;

  if (!length) {
    return [];
  }
  if ($offset > length - 1) {
    return [];
  }

  const start = Math.min(length - 1, $offset);
  const end = Math.min(length, $offset + $limit);

  return array.slice(start, end);
}
