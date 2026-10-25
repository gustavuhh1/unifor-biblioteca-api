// Quais pastas um livro salvo tem (RF-SAL-03). Funções puras: devolvem a lista
// nova e deixam a original como está.

// A lista com a pasta. Se ela já estava, devolve uma cópia igual.
export function folderIdsWith(
  folderIds: readonly string[],
  folderId: string,
): string[] {
  return folderIds.includes(folderId)
    ? [...folderIds]
    : [...folderIds, folderId]
}

// A lista sem a pasta.
export function folderIdsWithout(
  folderIds: readonly string[],
  folderId: string,
): string[] {
  return folderIds.filter((id) => id !== folderId)
}
