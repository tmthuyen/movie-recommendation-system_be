import { Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export abstract class BaseAuditEntity {
  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @Column({ nullable: true })
  createdBy: string; // Stores user UUID or username

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @Column({ nullable: true })
  updatedBy: string;
}
