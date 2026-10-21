import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Usuario,
  UsuarioDocument,
  ProvedorAutenticacao,
} from '../../usuarios/schemas/usuario.schema.js';

interface GoogleProfile {
  id: string;
  emails: Array<{ value: string; verified: boolean }>;
  name: { givenName: string; familyName: string };
  photos: Array<{ value: string }>;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    private readonly configService: ConfigService,
    @InjectModel(Usuario.name)
    private readonly usuarioModel: Model<UsuarioDocument>,
  ) {
    const clientID = configService.getOrThrow<string>('GOOGLE_CLIENT_ID');
    const clientSecret = configService.getOrThrow<string>('GOOGLE_CLIENT_SECRET');
    const callbackURL = configService.getOrThrow<string>('GOOGLE_CALLBACK_URL');

    super({
      clientID,
      clientSecret,
      callbackURL,
      scope: ['openid', 'email', 'profile'],
      passReqToCallback: true,
    });
  }

  async validate(
    req: Request,
    accessToken: string,
    refreshToken: string,
    profile: GoogleProfile,
    done: VerifyCallback,
  ): Promise<void> {
    try {
      if (!profile.emails || profile.emails.length === 0) {
        return done(new UnauthorizedException('E-mail não fornecido pelo Google'), undefined);
      }

      const email = profile.emails[0].value.toLowerCase().trim();
      const emailVerificado = profile.emails[0].verified === true;
      const googleId = profile.id;
      const nome = `${profile.name.givenName} ${profile.name.familyName}`.trim();
      const avatarUrl = profile.photos?.[0]?.value;

      let usuario = await this.usuarioModel.findOne({ googleId }).exec();

      if (usuario) {
        if (!usuario.ativo) {
          return done(new UnauthorizedException('Conta desativada'), undefined);
        }
        usuario.nome = nome;
        usuario.avatarUrl = avatarUrl;
        if (emailVerificado && !usuario.email_verificado) {
          usuario.email_verificado = true;
        }
        if (usuario.provedorAutenticacao === ProvedorAutenticacao.LOCAL) {
          usuario.provedorAutenticacao = ProvedorAutenticacao.AMBOS;
        }
        await usuario.save();
        return done(null, usuario);
      }

      usuario = await this.usuarioModel.findOne({ email }).exec();

      if (usuario) {
        if (!usuario.ativo) {
          return done(new UnauthorizedException('Conta desativada'), undefined);
        }
        if (usuario.googleId && usuario.googleId !== googleId) {
          return done(new UnauthorizedException('Este e-mail já está vinculado a outra conta Google'), undefined);
        }
        usuario.googleId = googleId;
        usuario.nome = nome;
        usuario.avatarUrl = avatarUrl;
        if (emailVerificado && !usuario.email_verificado) {
          usuario.email_verificado = true;
        }
        if (usuario.provedorAutenticacao === ProvedorAutenticacao.LOCAL) {
          usuario.provedorAutenticacao = ProvedorAutenticacao.AMBOS;
        } else if (usuario.provedorAutenticacao === ProvedorAutenticacao.GOOGLE) {
          usuario.provedorAutenticacao = ProvedorAutenticacao.GOOGLE;
        }
        await usuario.save();
        return done(null, usuario);
      }

      usuario = await this.usuarioModel.create({
        nome,
        email,
        googleId,
        avatarUrl,
        email_verificado: emailVerificado,
        provedorAutenticacao: ProvedorAutenticacao.GOOGLE,
        senha_hash: undefined,
      });

      return done(null, usuario);
    } catch (erro) {
      return done(erro, undefined);
    }
  }
}
