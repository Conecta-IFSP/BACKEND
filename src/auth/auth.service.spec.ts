import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service.js';
import { getModelToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Usuario } from '../usuarios/schemas/usuario.schema.js';
import { UnauthorizedException } from '@nestjs/common';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { UsuarioDocument } from '../usuarios/schemas/usuario.schema.js';
import { LoginDto } from './dto/login.dto.js';

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
