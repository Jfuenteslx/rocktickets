import { IsBoolean } from 'class-validator';

export class SetTierPausedDto {
  @IsBoolean()
  isPaused!: boolean;
}
