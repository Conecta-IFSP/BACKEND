import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service.js';
import { getModelToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Usuario, ProvedorAutenticacao, UsuarioDocument } from '../usuarios/schemas/usuario.schema.js';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto.js';
import { GoogleLoginDto } from './dto/google-login.dto.js';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getModelToken(Usuario.name), useValue: {} },
        { provide: JwtService, useValue: {} },
        { provide: ConfigService, useValue: {} },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

describe('Login', () => {
  const senha = 'SenhaTeste123';
  let hash: string;

  beforeAll(async () => {
    hash = await bcrypt.hash(senha, 4);
  });

  function preparar(usuario: unknown) {
    const consulta = {
      select: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue(usuario),
    };
    const model = { findOne: vi.fn().mockReturnValue(consulta) };
    const jwt = { signAsync: vi.fn().mockResolvedValue('token-teste') };
    const service = new AuthService(
      model as unknown as Model<UsuarioDocument>,
      jwt as unknown as JwtService,
      {} as ConfigService,
    );
    return { service, model, consulta, jwt };
  }

  it.each([undefined, null, '', 123])('recusa hash ausente ou inválido (%s) sem emitir token', async (senha_hash) => {
    const { service, jwt } = preparar({ ativo: true, senha_hash });
    await expect(service.login({ email: 'teste@example.com', senha })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it.each([undefined, null, '', 123])('recusa senha ausente ou inválida (%s)', async (valor) => {
    const { service, jwt, model } = preparar({ ativo: true, senha_hash: hash });
    await expect(service.login({ email: 'teste@example.com', senha: valor } as LoginDto)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(model.findOne).not.toHaveBeenCalled();
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it.each([null, { ativo: false }, { ativo: true, senha_hash: 'hash-invalido' }])('recusa conta inexistente, desativada ou hash malformado', async (usuario) => {
    const { service, jwt } = preparar(usuario);
    await expect(service.login({ email: 'teste@example.com', senha })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it('recusa senha incorreta', async () => {
    const { service, jwt } = preparar({ ativo: true, senha_hash: hash });
    await expect(service.login({ email: 'teste@example.com', senha: 'SenhaErrada' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it('autentica com bcrypt e não devolve o hash', async () => {
    const { service, model, consulta, jwt } = preparar({
      _id: 'usuario-teste', nome: 'Teste', email: 'teste@example.com',
      tipo: 'USUARIO', tema: 'sistema', ativo: true, senha_hash: hash,
    });
    const resultado = await service.login({ email: ' TESTE@example.com ', senha });
    expect(model.findOne).toHaveBeenCalledWith({ email: 'teste@example.com' });
    expect(consulta.select).toHaveBeenCalledWith('+senha_hash +senhaHash');
    expect(jwt.signAsync).toHaveBeenCalledWith({ sub: 'usuario-teste', email: 'teste@example.com', tipo: 'USUARIO' });
    expect(resultado.access_token).toBe('token-teste');
    expect(resultado.usuario).not.toHaveProperty('senha_hash');
  });

  it('autentica cadastro antigo sem devolver o hash legado', async () => {
    const { service } = preparar({
      _id: 'usuario-antigo', ativo: true, senhaHash: hash,
    });
    const resultado = await service.login({ email: 'teste@example.com', senha });
    expect(resultado.access_token).toBe('token-teste');
    expect(resultado.usuario).not.toHaveProperty('senhaHash');
  });

  it('não aceita a senha antiga quando existe uma senha atual', async () => {
    const { service, jwt } = preparar({
      ativo: true, senhaHash: hash,
      senha_hash: await bcrypt.hash('NovaSenha123', 4),
    });
    await expect(service.login({ email: 'teste@example.com', senha })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });
});

describe('Login com Google', () => {
  const googlePayload = {
    sub: 'google-sub-123',
    email: 'usuario@google.com',
    email_verified: true,
    name: 'Usuario Google',
    picture: 'https://example.com/avatar.png',
    aud: 'client-id-teste',
    iss: 'https://accounts.google.com',
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  const mockFetch = vi.fn();
  global.fetch = mockFetch;

  function prepararGoogleService(usuario: UsuarioDocument | null, sobrescreverFetch = true) {
    const model = {
      findOne: vi.fn((query: any) => {
        if (query.googleId) {
          return {
            select: vi.fn().mockReturnThis(),
            exec: vi.fn().mockResolvedValue(usuario && usuario.googleId === query.googleId ? usuario : null),
          };
        }
        if (query.email) {
          return {
            select: vi.fn().mockReturnThis(),
            exec: vi.fn().mockResolvedValue(usuario && usuario.email === query.email ? usuario : null),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          exec: vi.fn().mockResolvedValue(null),
        };
      }),
      create: vi.fn().mockResolvedValue(usuario),
    };
    const jwt = { sign: vi.fn().mockReturnValue('jwt-token-google') };
    const config = {
      getOrThrow: vi.fn((key: string) => {
        if (key === 'GOOGLE_CLIENT_ID') return 'client-id-teste';
        if (key === 'GOOGLE_CLIENT_SECRET') return 'client-secret-teste';
        return undefined;
      }),
    };
    const service = new AuthService(
      model as unknown as Model<UsuarioDocument>,
      jwt as unknown as JwtService,
      config as unknown as ConfigService,
    );
    return { service, model, jwt, config };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it('recusa código ausente ou inválido', async () => {
    const { service } = prepararGoogleService(null);
    await expect(service.loginComGoogle({ code: '', redirectUri: 'http://localhost' } as GoogleLoginDto))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('recusa redirectUri ausente', async () => {
    const { service } = prepararGoogleService(null);
    await expect(service.loginComGoogle({ code: 'code-valido', redirectUri: '' } as GoogleLoginDto))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('recusa quando Google não retorna ID Token', async () => {
    const { service } = prepararGoogleService(null);
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'token' }) });
    await expect(service.loginComGoogle({ code: 'code-valido', redirectUri: 'http://localhost' } as GoogleLoginDto))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('recusa ID Token com audience inválida', async () => {
    const { service } = prepararGoogleService(null);
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id_token: 'id-token' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...googlePayload, aud: 'outro-client-id' }) });
    await expect(service.loginComGoogle({ code: 'code-valido', redirectUri: 'http://localhost' } as GoogleLoginDto))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('recusa ID Token com emissor inválido', async () => {
    const { service } = prepararGoogleService(null);
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id_token: 'id-token' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...googlePayload, iss: 'https://invalido.com' }) });
    await expect(service.loginComGoogle({ code: 'code-valido', redirectUri: 'http://localhost' } as GoogleLoginDto))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('recusa ID Token expirado', async () => {
    const { service } = prepararGoogleService(null);
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id_token: 'id-token' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...googlePayload, exp: Math.floor(Date.now() / 1000) - 3600 }) });
    await expect(service.loginComGoogle({ code: 'code-valido', redirectUri: 'http://localhost' } as GoogleLoginDto))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('recusa quando e-mail do Google não está verificado', async () => {
    const { service } = prepararGoogleService(null);
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id_token: 'id-token' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...googlePayload, email_verified: false }) });
    await expect(service.loginComGoogle({ code: 'code-valido', redirectUri: 'http://localhost' } as GoogleLoginDto))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('cria novo usuário quando googleId não existe e e-mail não está cadastrado', async () => {
    const novoUsuario = {
      _id: 'novo-usuario-id',
      nome: googlePayload.name,
      email: googlePayload.email,
      googleId: googlePayload.sub,
      avatarUrl: googlePayload.picture,
      email_verificado: true,
      provedorAutenticacao: ProvedorAutenticacao.GOOGLE,
      senha_hash: undefined,
      tipo: 'USUARIO',
      tema: 'sistema',
      ativo: true,
      save: vi.fn().mockResolvedValue(true),
    };
    const { service, model, jwt } = prepararGoogleService(null); // Pass null so findOne returns null
    model.create.mockResolvedValue(novoUsuario);

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id_token: 'id-token' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => googlePayload });

    const resultado = await service.loginComGoogle({ code: 'code-valido', redirectUri: 'http://localhost' } as GoogleLoginDto);

    expect(model.findOne).toHaveBeenCalledWith({ googleId: googlePayload.sub });
    expect(model.findOne).toHaveBeenCalledWith({ email: googlePayload.email });
    expect(model.create).toHaveBeenCalledWith(expect.objectContaining({
      nome: googlePayload.name,
      email: googlePayload.email,
      googleId: googlePayload.sub,
      avatarUrl: googlePayload.picture,
      email_verificado: true,
      provedorAutenticacao: ProvedorAutenticacao.GOOGLE,
      senha_hash: undefined,
    }));
    expect(jwt.sign).toHaveBeenCalledWith({ sub: 'novo-usuario-id', email: googlePayload.email, tipo: 'USUARIO' });
    expect(resultado.access_token).toBe('jwt-token-google');
  });

  it('loga usuário existente pelo googleId', async () => {
    const usuarioExistente = {
      _id: 'usuario-existente',
      nome: 'Nome Antigo',
      email: googlePayload.email,
      googleId: googlePayload.sub,
      avatarUrl: 'https://antigo.com/avatar.png',
      email_verificado: true,
      provedorAutenticacao: ProvedorAutenticacao.GOOGLE,
      tipo: 'USUARIO',
      tema: 'sistema',
      ativo: true,
      save: vi.fn().mockResolvedValue(true),
    };
    const { service, model, jwt } = prepararGoogleService(usuarioExistente as any);
    model.create.mockResolvedValue(usuarioExistente);

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id_token: 'id-token' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => googlePayload });

    const resultado = await service.loginComGoogle({ code: 'code-valido', redirectUri: 'http://localhost' } as GoogleLoginDto);

    expect(model.findOne).toHaveBeenCalledWith({ googleId: googlePayload.sub });
    expect(model.create).not.toHaveBeenCalled();
    expect(usuarioExistente.nome).toBe(googlePayload.name);
    expect(usuarioExistente.avatarUrl).toBe(googlePayload.picture);
    expect(jwt.sign).toHaveBeenCalled();
    expect(resultado.access_token).toBe('jwt-token-google');
  });

  it('vincula googleId a conta local existente pelo e-mail', async () => {
    const usuarioLocal = {
      _id: 'usuario-local',
      nome: 'Usuario Local',
      email: googlePayload.email,
      googleId: undefined,
      avatarUrl: undefined,
      email_verificado: true,
      provedorAutenticacao: ProvedorAutenticacao.LOCAL,
      senha_hash: 'hash-local',
      tipo: 'USUARIO',
      tema: 'sistema',
      ativo: true,
      save: vi.fn().mockResolvedValue(true),
    };
    const { service, model, jwt } = prepararGoogleService(usuarioLocal as any);
    model.create.mockResolvedValue(usuarioLocal);

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id_token: 'id-token' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => googlePayload });

    const resultado = await service.loginComGoogle({ code: 'code-valido', redirectUri: 'http://localhost' } as GoogleLoginDto);

    expect(model.findOne).toHaveBeenCalledWith({ googleId: googlePayload.sub });
    expect(model.findOne).toHaveBeenCalledWith({ email: googlePayload.email });
    expect(model.create).not.toHaveBeenCalled();
    expect(usuarioLocal.googleId).toBe(googlePayload.sub);
    expect(usuarioLocal.provedorAutenticacao).toBe(ProvedorAutenticacao.AMBOS);
    expect(usuarioLocal.nome).toBe(googlePayload.name);
    expect(usuarioLocal.avatarUrl).toBe(googlePayload.picture);
    expect(jwt.sign).toHaveBeenCalled();
    expect(resultado.access_token).toBe('jwt-token-google');
  });

  it('recusa vincular Google a conta local de outro usuário com mesmo e-mail mas googleId diferente', async () => {
    const usuarioOutroGoogle = {
      _id: 'usuario-outro',
      nome: 'Outro Usuario',
      email: googlePayload.email,
      googleId: 'outro-google-sub',
      avatarUrl: undefined,
      email_verificado: true,
      provedorAutenticacao: ProvedorAutenticacao.GOOGLE,
      tipo: 'USUARIO',
      tema: 'sistema',
      ativo: true,
      save: vi.fn().mockResolvedValue(true),
    };
    const { service, model } = prepararGoogleService(usuarioOutroGoogle as any);
    model.create.mockResolvedValue(usuarioOutroGoogle);

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id_token: 'id-token' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => googlePayload });

    await expect(service.loginComGoogle({ code: 'code-valido', redirectUri: 'http://localhost' } as GoogleLoginDto))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('recusa login Google para conta desativada', async () => {
    const usuarioDesativado = {
      _id: 'usuario-desativado',
      nome: 'Usuario',
      email: googlePayload.email,
      googleId: googlePayload.sub,
      email_verificado: true,
      provedorAutenticacao: ProvedorAutenticacao.GOOGLE,
      ativo: false,
    };
    const { service, model } = prepararGoogleService(usuarioDesativado);

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id_token: 'id-token' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => googlePayload });

    await expect(service.loginComGoogle({ code: 'code-valido', redirectUri: 'http://localhost' } as GoogleLoginDto))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('recusa quando troca de código falha no Google', async () => {
    const { service } = prepararGoogleService(null);
    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error_description: 'Invalid code' }) });
    await expect(service.loginComGoogle({ code: 'code-invalido', redirectUri: 'http://localhost' } as GoogleLoginDto))
      .rejects.toBeInstanceOf(BadRequestException);
  });
});
