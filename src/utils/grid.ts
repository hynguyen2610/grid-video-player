export function getGridColumns(cellCount: number): number {
  if (cellCount <= 1) {
    return 1;
  }

  if (cellCount <= 4) {
    return 2;
  }

  if (cellCount <= 9) {
    return 3;
  }

  if (cellCount <= 16) {
    return 4;
  }

  if (cellCount <= 25) {
    return 5;
  }

  return 6;
}

export function getGridRows(cellCount: number): number {
  if (cellCount === 0) {
    return 1;
  }

  const columns = getGridColumns(cellCount);
  return Math.ceil(cellCount / columns);
}

export function getGridTier(cellCount: number): 'small' | 'medium' | 'large' | 'dense' {
  const columns = getGridColumns(cellCount);

  if (columns <= 2) {
    return 'small';
  }

  if (columns === 3) {
    return 'medium';
  }

  if (columns === 4) {
    return 'large';
  }

  return 'dense';
}
