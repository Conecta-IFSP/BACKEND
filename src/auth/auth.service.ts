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
  ProvedorAutenticacao,
} from '../usuarios/schemas/usuario.schema.js';

import { LoginDto } from './dto/login.dto.js';
import { RecuperarContaDto } from './dto/recuperar-conta.dto.js';
import { RedefinirSenhaDto } from './dto/redefinir-senha.dto.js';
import { VerificarCadastroDto } from './dto/verificar-cadastro.dto.js';
import { GoogleLoginDto } from './dto/google-login.dto.js';
import { VerificarRecuperacaoDto } from './dto/verificar-recuperacao.dto.js';

const DURACAO_TOKEN_RECUPERACAO_MS = 30 * 60 * 1000;
const DURACAO_CODIGO_VERIFICACAO_MS = 30 * 60 * 1000;
const CARACTERES_CODIGO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

@Injectable()
export class AuthService {
  private transportador?: Transporter;

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
      .select('+senha_hash')
      .exec();

    if (!usuario) {
      throw new UnauthorizedException('Email ou senha inválidos');
    }

    if (!usuario.ativo) {
      throw new UnauthorizedException('Usuário desativado');
    }

    if (usuario.email_verificado === false) {
      throw new UnauthorizedException('Confirme seu e-mail antes de entrar');
    }

    const hash = usuario.senha_hash;
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

  async loginComGoogle(dto: GoogleLoginDto) {
    let payload: {
      sub: string;
      email: string;
      email_verified: boolean | string;
      name?: string;
      picture?: string;
    };

    if (dto.id_token?.trim()) {
      // O SDK nativo retorna um ID Token com audience do cliente Web.
      // O cliente Android/iOS é validado pelo Google Play Services/SDK.
      const webClientId = this.configService.getOrThrow<string>('GOOGLE_CLIENT_ID');
      payload = await this.validarIdTokenGoogle(dto.id_token.trim(), webClientId);
    } else {
      if (!dto.code || !dto.code.trim()) {
        throw new BadRequestException('Código de autorização não informado');
      }
    const redirectUri = dto.redirect_uri?.trim();
    if (!redirectUri) {
      throw new BadRequestException('URI de redirecionamento não informada');
    }

    const isNativeRedirect = /^(conectamais|exp):\/\//i.test(redirectUri);
    const clientID = isNativeRedirect && dto.plataforma === 'android'
      ? this.configService.get<string>('GOOGLE_ANDROID_CLIENT_ID') ??
        this.configService.getOrThrow<string>('GOOGLE_CLIENT_ID')
      : isNativeRedirect && dto.plataforma === 'ios'
        ? this.configService.get<string>('GOOGLE_IOS_CLIENT_ID') ??
          this.configService.getOrThrow<string>('GOOGLE_CLIENT_ID')
        : this.configService.getOrThrow<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: dto.code,
        client_id: clientID,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        ...(isNativeRedirect && !clientSecret ? {} : { client_secret: clientSecret ?? '' }),
      }),
    });

    if (!tokenResponse.ok) {
      const erro = await tokenResponse.json().catch(() => ({}));
      throw new BadRequestException(erro.error_description ?? 'Falha ao trocar código por token');
    }

    const tokens = await tokenResponse.json();
    const idToken = tokens.id_token as string;

    if (!idToken) {
      throw new BadRequestException('ID Token não retornado pelo Google');
    }

    payload = await this.validarIdTokenGoogle(idToken, clientID);
    }

    const googleId = payload.sub;
    const email = payload.email.toLowerCase().trim();
    // O endpoint tokeninfo pode retornar esse campo como boolean ou como
    // string ("true"), dependendo do fluxo OAuth.
    const emailVerificado =
      payload.email_verified === true || payload.email_verified === 'true';
    const nome = payload.name ?? '';
    const avatarUrl = payload.picture;

    if (!emailVerificado) {
      throw new BadRequestException('O e-mail da conta Google não está verificado');
    }

    let usuario = await this.usuarioModel.findOne({ google_id: googleId }).exec();

    if (usuario) {
      if (!usuario.ativo) {
        throw new UnauthorizedException('Conta desativada');
      }
      usuario.nome = nome;
      usuario.avatar_url = avatarUrl;
      if (!usuario.email_verificado) {
        usuario.email_verificado = true;
      }
      if (usuario.provedor_autenticacao === ProvedorAutenticacao.LOCAL) {
        usuario.provedor_autenticacao = ProvedorAutenticacao.AMBOS;
      }
      await usuario.save();
      return this.gerarRespostaLogin(usuario);
    }

    usuario = await this.usuarioModel.findOne({ email }).exec();

    if (usuario) {
      if (!usuario.ativo) {
        throw new UnauthorizedException('Conta desativada');
      }
      if (usuario.google_id && usuario.google_id !== googleId) {
        throw new BadRequestException('Este e-mail já está vinculado a outra conta Google');
      }
      usuario.google_id = googleId;
      usuario.nome = nome;
      usuario.avatar_url = avatarUrl;
      if (!usuario.email_verificado) {
        usuario.email_verificado = true;
      }
      if (usuario.provedor_autenticacao === ProvedorAutenticacao.LOCAL) {
        usuario.provedor_autenticacao = ProvedorAutenticacao.AMBOS;
      } else if (usuario.provedor_autenticacao === ProvedorAutenticacao.GOOGLE) {
        usuario.provedor_autenticacao = ProvedorAutenticacao.GOOGLE;
      }
      await usuario.save();
      return this.gerarRespostaLogin(usuario);
    }

    usuario = await this.usuarioModel.create({
      nome,
      email,
      google_id: googleId,
      avatar_url: avatarUrl,
      email_verificado: true,
      provedor_autenticacao: ProvedorAutenticacao.GOOGLE,
      senha_hash: undefined,
    });

    return this.gerarRespostaLogin(usuario);
  }

  private async validarIdTokenGoogle(idToken: string, clientID: string) {
    const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    if (!response.ok) {
      throw new BadRequestException('ID Token inválido ou expirado');
    }
    const payload = await response.json();

    if (payload.aud !== clientID) {
      throw new BadRequestException('ID Token emitido para outro cliente');
    }
    if (payload.iss !== 'accounts.google.com' && payload.iss !== 'https://accounts.google.com') {
      throw new BadRequestException('Emissor do ID Token inválido');
    }
    const exp = Number(payload.exp);
    if (!exp || exp * 1000 < Date.now()) {
      throw new BadRequestException('ID Token expirado');
    }

    return payload as {
      sub: string;
      email: string;
      email_verified: boolean | string;
      name?: string;
      picture?: string;
    };
  }

  private gerarRespostaLogin(usuario: UsuarioDocument) {
    const payload = {
      sub: usuario._id.toString(),
      email: usuario.email,
      tipo: usuario.tipo,
    };

    const accessToken = this.jwtService.sign(payload);

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

  async enviarCodigoVerificacao(id: string) {
    const usuario = await this.usuarioModel.findById(id).exec();
    if (!usuario || usuario.email_verificado) return;

    const codigo = this.gerarCodigoVerificacao();
    usuario.verificacao_email_codigo_hash = this.hashToken(codigo);
    usuario.verificacao_email_expira_em = new Date(Date.now() + DURACAO_CODIGO_VERIFICACAO_MS);
    await usuario.save();

    await this.criarTransportador().sendMail({
      from: this.configService.get<string>('MAIL_FROM') ?? 'Conecta+ <nao-responda@conectamais.local>',
      to: usuario.email,
      subject: 'Confirme seu cadastro no Conecta+',
      text: `Olá, ${usuario.nome}. Seu código de confirmação é ${codigo}. Ele expira em 30 minutos.`,
      html: `<p>Olá, ${usuario.nome}.</p><p>Use este código para finalizar seu cadastro:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${codigo.slice(0, 3)}-${codigo.slice(3)}</p><p>O código expira em 30 minutos.</p>`,
    });
    if (!this.smtpConfigurado()) console.log(`[desenvolvimento] Código de verificação para ${usuario.email}: ${codigo.slice(0, 3)}-${codigo.slice(3)}`);
  }

  async verificarCadastro(dto: VerificarCadastroDto) {
    const email = dto.email.toLowerCase().trim();
    const codigo = dto.codigo.replace('-', '').toUpperCase();
    const usuario = await this.usuarioModel.findOne({ email }).select('+verificacao_email_codigo_hash +verificacao_email_expira_em').exec();
    if (!usuario || usuario.email_verificado || codigo.length !== 7 || !/^[A-Z0-9]{7}$/.test(codigo) ||
      usuario.verificacao_email_codigo_hash !== this.hashToken(codigo) ||
      !usuario.verificacao_email_expira_em || usuario.verificacao_email_expira_em <= new Date()) {
      throw new BadRequestException('O código de confirmação é inválido ou expirou');
    }
    usuario.email_verificado = true;
    usuario.verificacao_email_codigo_hash = undefined;
    usuario.verificacao_email_expira_em = undefined;
    await usuario.save();
    return { mensagem: 'Cadastro confirmado com sucesso' };
  }

  async solicitarAlteracaoEmail(id: string, novoEmail: string) {
    const email = novoEmail.toLowerCase().trim();
    const usuario = await this.usuarioModel.findById(id).exec();

    if (!usuario) {
      throw new UnauthorizedException('Usuário não encontrado');
    }
    if (usuario.email === email) {
      throw new BadRequestException('Informe um e-mail diferente do atual');
    }

    const existente = await this.usuarioModel.findOne({ email, _id: { $ne: id } }).exec();
    if (existente) {
      throw new BadRequestException('Já existe um usuário com este email');
    }

    const codigo = this.gerarCodigoVerificacao();
    usuario.email_pendente = email;
    usuario.email_pendente_codigo_hash = this.hashToken(codigo);
    usuario.email_pendente_expira_em = new Date(Date.now() + DURACAO_CODIGO_VERIFICACAO_MS);
    await usuario.save();

    await this.criarTransportador().sendMail({
      from: this.configService.get<string>('MAIL_FROM') ?? 'Conecta+ <nao-responda@conectamais.local>',
      to: email,
      subject: 'Confirme a alteração do seu e-mail no Conecta+',
      text: `Seu código de confirmação é ${codigo.slice(0, 3)}-${codigo.slice(3)}. Ele expira em 30 minutos.`,
      html: `<p>Seu código para confirmar a alteração do e-mail é:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${codigo.slice(0, 3)}-${codigo.slice(3)}</p><p>O código expira em 30 minutos.</p>`,
    });

    return { mensagem: 'Enviamos um código de confirmação para o novo e-mail.' };
  }

  async confirmarAlteracaoEmail(id: string, emailInformado: string, codigoInformado: string) {
    const email = emailInformado.toLowerCase().trim();
    const codigo = codigoInformado.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const usuario = await this.usuarioModel
      .findById(id)
      .select('+email_pendente +email_pendente_codigo_hash +email_pendente_expira_em')
      .exec();

    if (!usuario || usuario.email_pendente !== email || codigo.length !== 7 ||
      usuario.email_pendente_codigo_hash !== this.hashToken(codigo) ||
      !usuario.email_pendente_expira_em || usuario.email_pendente_expira_em <= new Date()) {
      throw new BadRequestException('O código de confirmação é inválido ou expirou');
    }

    const existente = await this.usuarioModel.findOne({ email, _id: { $ne: id } }).exec();
    if (existente) {
      throw new BadRequestException('Já existe um usuário com este email');
    }

    usuario.email = email;
    usuario.email_verificado = true;
    usuario.email_pendente = undefined;
    usuario.email_pendente_codigo_hash = undefined;
    usuario.email_pendente_expira_em = undefined;
    await usuario.save();

    return { mensagem: 'E-mail alterado com sucesso', email };
  }

  private gerarCodigoVerificacao() {
    let codigo = '';
    for (let i = 0; i < 7; i++) codigo += CARACTERES_CODIGO[randomBytes(1)[0] % CARACTERES_CODIGO.length];
    return codigo;
  }

  async solicitarRecuperacao(recuperarContaDto: RecuperarContaDto) {
    const email = recuperarContaDto.email.toLowerCase().trim();
    const usuario = await this.usuarioModel.findOne({ email, ativo: true }).exec();

    const mensagem =
      'Se existir uma conta ativa para este e-mail, enviaremos as instruções de recuperação.';

    if (!usuario) {
      return { mensagem };
    }

    const codigo = this.gerarCodigoVerificacao();
    usuario.reset_senha_token_hash = undefined;
    usuario.reset_senha_codigo_hash = this.hashToken(codigo);
    usuario.reset_senha_expira_em = new Date(Date.now() + DURACAO_TOKEN_RECUPERACAO_MS);
    await usuario.save();

    await this.criarTransportador().sendMail({
      from: this.configService.get<string>('MAIL_FROM') ?? 'Conecta+ <nao-responda@conectamais.local>',
      to: usuario.email,
      subject: 'Recuperação de conta do Conecta+',
      text: `Olá, ${usuario.nome}. Seu código de recuperação é ${codigo.slice(0, 3)}-${codigo.slice(3)}. Ele expira em 30 minutos.`,
      html: `<p>Olá, ${usuario.nome}.</p><p>Use este código para criar uma nova senha:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${codigo.slice(0, 3)}-${codigo.slice(3)}</p><p>O código expira em 30 minutos.</p>`,
    });

    if (!this.smtpConfigurado()) {
      console.log(`[desenvolvimento] Código de recuperação para ${usuario.email}: ${codigo.slice(0, 3)}-${codigo.slice(3)}`);
    }

    return { mensagem };
  }

  async verificarRecuperacao(dto: VerificarRecuperacaoDto) {
    const email = dto.email.toLowerCase().trim();
    const codigo = dto.codigo.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const usuario = await this.usuarioModel
      .findOne({ email, ativo: true })
      .select('+reset_senha_codigo_hash +reset_senha_expira_em')
      .exec();

    if (!usuario || codigo.length !== 7 ||
      usuario.reset_senha_codigo_hash !== this.hashToken(codigo) ||
      !usuario.reset_senha_expira_em || usuario.reset_senha_expira_em <= new Date()) {
      throw new BadRequestException('O código de recuperação é inválido ou expirou');
    }

    const token = randomBytes(32).toString('hex');
    usuario.reset_senha_token_hash = this.hashToken(token);
    usuario.reset_senha_codigo_hash = undefined;
    await usuario.save();

    return { token };
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
      throw new BadRequestException('A recuperação expirou. Solicite um novo código');
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
    if (this.transportador) return this.transportador;

    const host = this.configService.get<string>('MAIL_HOST');

    if (!host || !this.smtpConfigurado()) {
      this.transportador = nodemailer.createTransport({ jsonTransport: true });
      return this.transportador;
    }

    const port = Number(this.configService.get<string>('MAIL_PORT') ?? 587);
    const usuario = this.configService.get<string>('MAIL_USER');
    const senha = this.configService.get<string>('MAIL_PASS');

    this.transportador = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: usuario && senha ? { user: usuario, pass: senha } : undefined,
      // Evita que a tela fique aguardando indefinidamente quando o SMTP
      // estiver indisponível ou quando a autenticação do Gmail falhar.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    return this.transportador;
  }
}
