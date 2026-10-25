import { AppError } from '../../shared/errors.js'

// Erros do módulo de Salvos. O code é estável e em inglês; a mensagem é mostrada
// ao usuário, em português. O livro que não existe usa bookNotFound, do acervo.

// 404: a pasta não existe (ou é de outro aluno) (RF-SAL-02, RF-SAL-03).
export function folderNotFound(): AppError {
  return new AppError(404, 'folder_not_found', 'Pasta não encontrada.')
}

// 409: o livro precisa estar em "Todos os salvos" antes de entrar numa pasta
// (RF-SAL-03).
export function bookNotSaved(): AppError {
  return new AppError(
    409,
    'book_not_saved',
    'Salve o livro antes de colocá-lo numa pasta.',
  )
}
