export type DocumentNavigationRow = {
  id: string;
  measuredAt: string;
  createdAt: string;
};

export type AdjacentDocumentIds = {
  previousId: string | null;
  nextId: string | null;
};

export function sortDocumentNavigationRows(
  rows: DocumentNavigationRow[],
): DocumentNavigationRow[] {
  return [...rows].sort((a, b) => {
    const measuredOrder = b.measuredAt.localeCompare(a.measuredAt);
    if (measuredOrder !== 0) return measuredOrder;

    const createdOrder = b.createdAt.localeCompare(a.createdAt);
    if (createdOrder !== 0) return createdOrder;

    return a.id.localeCompare(b.id);
  });
}

export function getAdjacentDocumentIds(
  rows: DocumentNavigationRow[],
  currentId: string,
): AdjacentDocumentIds {
  const sortedRows = sortDocumentNavigationRows(rows);
  const currentIndex = sortedRows.findIndex((row) => row.id === currentId);
  if (currentIndex === -1) {
    return { previousId: null, nextId: null };
  }

  return {
    previousId: sortedRows[currentIndex - 1]?.id ?? null,
    nextId: sortedRows[currentIndex + 1]?.id ?? null,
  };
}

export function getDocumentDeleteRedirectHref(adjacentDocumentIds: AdjacentDocumentIds) {
  if (adjacentDocumentIds.previousId) {
    return `/documents/${adjacentDocumentIds.previousId}`;
  }

  if (adjacentDocumentIds.nextId) {
    return `/documents/${adjacentDocumentIds.nextId}`;
  }

  return "/documents";
}
