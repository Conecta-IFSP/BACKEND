import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';

import { Model } from 'mongoose';

import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import nodemailer, { type Transporter } from 'nodemailer';

import {
  Usuario,
  UsuarioDocument,
} from '../usuarios/schemas/usuario.schema.js';

import { LoginDto } from './dto/login.dto.js';
import { RecuperarContaDto } from './dto/recuperar-conta.dto.js';
import { RedefinirSenhaDto } from './dto/redefinir-senha.dto.js';

const DURACAO_TOKEN_RECUPERACAO_MS = 30 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(Usuario.name)
    private readonly usuarioModel: Model<UsuarioDocument>,

    private readonly jwtService: JwtService,

    private readonly configService: ConfigService,
  ) {}

  async login(loginDto: LoginDto) {
    if (typeof loginDto.senha !== 'string' || !loginDto.senha) {
      throw new UnauthorizedException('Email ou senha inválidos');
    }

    const email = loginDto.email.toLowerCase().trim();

    const usuario = await this.usuarioModel
      .findOne({ email })
      .select('+senha_hash +senhaHash')
      .exec();

    if (!usuario) {
      throw new UnauthorizedException('Email ou senha inválidos');
    }

    if (!usuario.ativo) {
      throw new UnauthorizedException('Usuário desativado');
    }

    // O campo atual tem precedência, inclusive após redefinir a senha.
    const hash = usuario.senha_hash ?? usuario.senhaHash;
    if (typeof hash !== 'string' || !hash) {
      throw new UnauthorizedException('Email ou senha inválidos');
    }

    const senhaValida = await bcrypt.compare(loginDto.senha, hash);

    if (!senhaValida) {
      throw new UnauthorizedException('Email ou senha inválidos');
    }

    const payload = {
      sub: usuario._id.toString(),
      email: usuario.email,
      tipo: usuario.tipo,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return {
      access_token: accessToken,

      usuario: {
        id: usuario._id,
        nome: usuario.nome,
        email: usuario.email,
        tipo: usuario.tipo,
        tema: usuario.tema,
      },
    };
  }

  async solicitarRecuperacao(recuperarContaDto: RecuperarContaDto) {
    const email = recuperarContaDto.email.toLowerCase().trim();
    const usuario = await this.usuarioModel.findOne({ email, ativo: true }).exec();

    const mensagem =
      'Se existir uma conta ativa para este e-mail, enviaremos as instruções de recuperação.';

    if (!usuario) {
      return { mensagem };
    }

    const token = randomBytes(32).toString('hex');
    usuario.reset_senha_token_hash = this.hashToken(token);
    usuario.reset_senha_expira_em = new Date(Date.now() + DURACAO_TOKEN_RECUPERACAO_MS);
    await usuario.save();

    const linkBase =
      this.configService.get<string>('APP_RESET_URL') ??
      'http://localhost:8081/login/redefinir-senha';
    const link = `${linkBase}?token=${encodeURIComponent(token)}`;

    await this.criarTransportador().sendMail({
      from: this.configService.get<string>('MAIL_FROM') ?? 'Conecta+ <nao-responda@conectamais.local>',
      to: usuario.email,
      subject: 'Recuperação de conta do Conecta+',
      text: `Olá, ${usuario.nome}. Use este link para criar uma nova senha: ${link}. O link expira em 30 minutos.`,
      html: `<p>Olá, ${usuario.nome}.</p><p>Use o botão abaixo para criar uma nova senha:</p><p><a href="${link}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#256ef1;color:#ffffff;text-decoration:none;font-weight:600">Redefinir minha senha</a></p><p>Se o botão não abrir, copie este endereço no navegador:</p><p><a href="${link}">${link}</a></p><p>O link expira em 30 minutos.</p>`,
    });

    if (!this.smtpConfigurado()) {
      console.log(`[desenvolvimento] Link de recuperação para ${usuario.email}: ${link}`);
    }

    return { mensagem };
  }

  async redefinirSenha(redefinirSenhaDto: RedefinirSenhaDto) {
    const tokenHash = this.hashToken(redefinirSenhaDto.token);
    const usuario = await this.usuarioModel
      .findOne({
        reset_senha_token_hash: tokenHash,
        reset_senha_expira_em: { $gt: new Date() },
        ativo: true,
      })
      .select('+senha_hash +reset_senha_token_hash +reset_senha_expira_em')
      .exec();

    if (!usuario) {
      throw new BadRequestException('O link de recuperação é inválido ou expirou');
    }

    usuario.senha_hash = await bcrypt.hash(redefinirSenhaDto.nova_senha, 10);
    usuario.reset_senha_token_hash = undefined;
    usuario.reset_senha_expira_em = undefined;
    await usuario.save();

    return { mensagem: 'Senha redefinida com sucesso' };
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private smtpConfigurado() {
    return Boolean(
      this.configService.get<string>('MAIL_HOST') &&
        this.configService.get<string>('MAIL_USER') &&
        this.configService.get<string>('MAIL_PASS'),
    );
  }

  private criarTransportador(): Transporter {
    const host = this.configService.get<string>('MAIL_HOST');

    if (!host || !this.smtpConfigurado()) {
      return nodemailer.createTransport({ jsonTransport: true });
    }

    const port = Number(this.configService.get<string>('MAIL_PORT') ?? 587);
    const usuario = this.configService.get<string>('MAIL_USER');
    const senha = this.configService.get<string>('MAIL_PASS');

    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: usuario && senha ? { user: usuario, pass: senha } : undefined,
    });
  }
}
