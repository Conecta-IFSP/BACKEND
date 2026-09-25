import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

import { TipoUsuario } from '../usuarios/schemas/usuario.schema.js';
import type { RequisicaoAutenticada } from './jwt-auth.guard.js';

@Injectable()
export class AdminSistemaGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const requisicao = context.switchToHttp().getRequest<RequisicaoAutenticada>();

    if (requisicao.usuario.tipo !== TipoUsuario.ADMIN_SISTEMA) {
      throw new ForbiddenException('Apenas administradores do sistema podem realizar esta operação');
    }

    return true;
  }
}

/** O administrador do sistema só gerencia a plataforma: não cria nem participa de organizações e comissões. */
@Injectable()
export class UsuarioComumGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const requisicao = context.switchToHttp().getRequest<RequisicaoAutenticada>();

    if (requisicao.usuario.tipo === TipoUsuario.ADMIN_SISTEMA) {
      throw new ForbiddenException('O administrador do sistema não pode realizar esta operação');
    }

    return true;
  }
}
