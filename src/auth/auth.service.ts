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

    const link = this.criarLinkDoEmail(token, recuperarContaDto.redirect_url);

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

  criarPaginaRedefinicao(token: string, redirectUrl: string) {
    if (!/^[a-f0-9]{64}$/i.test(token ?? '')) {
      throw new BadRequestException('O link de recuperação é inválido');
    }

    const linkExpo = new URL(this.validarUrlExpo(redirectUrl));
    linkExpo.searchParams.set('token', token);
    const destino = linkExpo.toString();
    const destinoHtml = this.escaparHtml(destino);
    const destinoJs = JSON.stringify(destino).replace(/</g, '\\u003c');

    return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Redefinir senha - Conecta+</title>
    <style>
      body{margin:0;font-family:Arial,sans-serif;background:#f4f6fb;color:#182033;display:grid;min-height:100vh;place-items:center;padding:24px;box-sizing:border-box}
      main{width:min(440px,100%);background:#fff;border-radius:18px;padding:32px;box-shadow:0 12px 36px #1725541f;text-align:center}
      h1{margin:0 0 12px;font-size:26px}p{line-height:1.5;color:#526078}
      a{display:block;margin-top:24px;padding:14px 18px;border-radius:10px;background:#256ef1;color:#fff;text-decoration:none;font-weight:700}
      small{display:block;margin-top:18px;color:#718096}
    </style>
  </head>
  <body>
    <main>
      <h1>Abrir o Conecta+</h1>
      <p>Estamos abrindo a tela de redefinição de senha no Expo Go.</p>
      <a href="${destinoHtml}">Abrir no Expo Go</a>
      <small>Mantenha o Expo aberto no computador e o celular na mesma rede.</small>
    </main>
    <script>window.location.href=${destinoJs};</script>
  </body>
</html>`;
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private criarLinkDoEmail(token: string, urlDoAplicativo?: string) {
    if (urlDoAplicativo) {
      try {
        const urlExpo = this.validarUrlExpo(urlDoAplicativo);
        const enderecoExpo = new URL(urlExpo);
        const pagina = new URL('http://localhost');
        pagina.hostname = enderecoExpo.hostname;
        pagina.port = String(this.configService.get<number>('PORT') ?? 3000);
        pagina.pathname = '/auth/abrir-redefinicao';
        pagina.search = '';
        pagina.hash = '';
        pagina.searchParams.set('token', token);
        pagina.searchParams.set('redirect_url', urlExpo);
        return pagina.toString();
      } catch {
        // Usa abaixo a URL configurada no servidor.
      }
    }

    const link = new URL(
      this.configService.get<string>('APP_RESET_URL') ??
        'http://localhost:8081/login/redefinir-senha',
    );
    link.searchParams.set('token', token);
    return link.toString();
  }

  private validarUrlExpo(valor: string) {
    try {
      const url = new URL(valor);
      const protocoloExpo = url.protocol === 'exp:' || url.protocol === 'exps:';
      const rotaCorreta = url.pathname === '/--/login/redefinir-senha';

      if (protocoloExpo && url.hostname && rotaCorreta && !url.search && !url.hash) {
        return url.toString();
      }
    } catch {
      // A mensagem pública é a mesma para qualquer URL inválida.
    }

    throw new BadRequestException('O endereço do Expo Go é inválido');
  }

  private escaparHtml(valor: string) {
    return valor
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
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
