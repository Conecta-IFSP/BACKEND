import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { RequisicaoAutenticada } from '../auth/jwt-auth.guard.js';
import {
  Usuario,
  UsuarioDocument,
} from '../usuarios/schemas/usuario.schema.js';

/** Revalida a conta para que um token antigo não mantenha permissões revogadas. */
@Injectable()
export class UsuarioAtivoGuard implements CanActivate {
  constructor(
    @InjectModel(Usuario.name)
    private readonly usuarios: Model<UsuarioDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requisicao = context
      .switchToHttp()
      .getRequest<RequisicaoAutenticada>();
    const usuario = await this.usuarios
      .findOne({ _id: requisicao.usuario.sub, ativo: true })
      .exec();
    if (!usuario)
      throw new UnauthorizedException('Conta inexistente ou desativada');
    requisicao.usuario.tipo = usuario.tipo;
    return true;
  }
}
