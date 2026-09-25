import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { Request } from 'express';
import { Usuario, type UsuarioDocument, type TipoUsuario } from '../usuarios/schemas/usuario.schema.js';

export type UsuarioAutenticado = {
  sub: string;
  email: string;
  tipo: TipoUsuario;
};

export type RequisicaoAutenticada = Request & {
  usuario: UsuarioAutenticado;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    @InjectModel(Usuario.name) private readonly usuarios: Model<UsuarioDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requisicao = context.switchToHttp().getRequest<RequisicaoAutenticada>();
    const token = this.extrairToken(requisicao);

    if (!token) {
      throw new UnauthorizedException('Token de acesso não informado');
    }

    try {
      requisicao.usuario = await this.jwtService.verifyAsync<UsuarioAutenticado>(token);
    } catch {
      throw new UnauthorizedException('Token de acesso inválido ou expirado');
    }

    if (typeof requisicao.usuario.sub !== 'string' || !Types.ObjectId.isValid(requisicao.usuario.sub)) {
      throw new UnauthorizedException('Token de acesso inválido ou expirado');
    }
    const usuario = await this.usuarios.findOne({ _id: requisicao.usuario.sub, ativo: true }).exec();
    if (!usuario) {
      throw new UnauthorizedException('Conta inexistente ou desativada');
    }
    // O token identifica a conta; as permissões sempre vêm do cadastro atual.
    requisicao.usuario.tipo = usuario.tipo;
    requisicao.usuario.email = usuario.email;
    return true;
  }

  private extrairToken(requisicao: Request): string | undefined {
    const [tipo, token] = requisicao.headers.authorization?.split(' ') ?? [];
    return tipo === 'Bearer' ? token : undefined;
  }
}
