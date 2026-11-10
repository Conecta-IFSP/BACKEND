import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { Response } from 'express';

export const TAMANHO_MAXIMO_ANEXO = 10 * 1024 * 1024;
export const MAXIMO_ANEXOS = 10;
export const TIPOS_ANEXO = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'text/plain',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
];

export type ArquivoRecebido = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

// O multer recusa arquivos grandes com "File too large"; aqui a mensagem fica em português.
@Catch(PayloadTooLargeException)
export class ArquivoGrandeFilter implements ExceptionFilter {
  catch(_erro: PayloadTooLargeException, host: ArgumentsHost) {
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(413)
      .json({ statusCode: 413, message: 'O arquivo deve ter até 10 MB' });
  }
}
