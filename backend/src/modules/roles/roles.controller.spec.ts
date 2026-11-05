import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

describe('RolesController', () => {
  let controller: RolesController;
  let rolesService: {
    findOne: jest.Mock;
    remove: jest.Mock;
  };

  beforeEach(async () => {
    rolesService = {
      findOne: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RolesController],
      providers: [{ provide: RolesService, useValue: rolesService }],
    }).compile();

    controller = module.get<RolesController>(RolesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findOne', () => {
    it('trả envelope thành công với result từ service', async () => {
      const role = { id: 1, code: 'ADMIN', name: 'Admin' };
      rolesService.findOne.mockResolvedValue(role);

      await expect(controller.findOne('1')).resolves.toMatchObject({
        success: true,
        statusCode: 200,
        result: role,
      });
      expect(rolesService.findOne).toHaveBeenCalledWith(1);
    });

    it('giữ nguyên NotFoundException (404) từ service', async () => {
      rolesService.findOne.mockRejectedValue(
        new NotFoundException('Role with ID 99 not found'),
      );

      await expect(controller.findOne('99')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('trả envelope thành công với result từ service', async () => {
      const role = { id: 2, code: 'MANAGER', name: 'Manager' };
      rolesService.remove.mockResolvedValue(role);

      await expect(controller.remove('2')).resolves.toMatchObject({
        success: true,
        statusCode: 200,
        result: role,
      });
      expect(rolesService.remove).toHaveBeenCalledWith(2);
    });

    it('giữ nguyên NotFoundException (404) từ service', async () => {
      rolesService.remove.mockRejectedValue(
        new NotFoundException('Role with ID 99 not found'),
      );

      await expect(controller.remove('99')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
