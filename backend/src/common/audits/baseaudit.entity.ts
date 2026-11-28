import { Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export abstract class BaseAuditEntity {
  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'created_by', nullable: true })
  createdBy: string; // Stores user UUID or username

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  @Column({ name: 'updated_by', nullable: true })
  updatedBy: string;
}
