import { IsString, MaxLength, MinLength } from 'class-validator';

export class GoogleLoginDto {
  @IsString()
  @MinLength(20)
  @MaxLength(5000)
  idToken!: string;
}
