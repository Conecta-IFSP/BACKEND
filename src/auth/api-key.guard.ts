import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { timingSafeEqual } from 'node:crypto';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();

    // O navegador envia OPTIONS antes de requisições com X-API-Key.
    if (request.method === 'OPTIONS') return true;

    // Estes endpoints são acessados por redirecionamento direto do Google,
    // portanto não conseguem enviar cabeçalhos customizados.
    if (this.isPublicBrowserRedirect(request)) return true;

    const esperado = this.configService.get<string>('API_ACCESS_TOKEN')?.trim();
    if (!esperado) {
      throw new ServiceUnavailableException('API_ACCESS_TOKEN não configurado no servidor');
    }

    const recebido = request.headers['x-api-key'];
    const chave = Array.isArray(recebido) ? recebido[0] : recebido;
    if (!chave || !this.chavesIguais(chave, esperado)) {
      throw new UnauthorizedException('Chave de acesso da API inválida ou ausente');
    }

    return true;
  }

  private isPublicBrowserRedirect(request: Request) {
    return request.method === 'GET' && [
      '/auth/google/callback',
      '/auth/google/callback-web',
    ].includes(request.path);
  }

  private chavesIguais(recebida: string, esperada: string) {
    const a = Buffer.from(recebida);
    const b = Buffer.from(esperada);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
