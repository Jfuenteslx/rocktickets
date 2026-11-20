import { IsEmail, MaxLength } from 'class-validator';

export class RecoverOrdersDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;
}
