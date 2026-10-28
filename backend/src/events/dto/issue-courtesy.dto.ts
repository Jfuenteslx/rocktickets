import { IsEmail, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class IssueCourtesyDto {
  @IsString()
  @MinLength(2)
  recipientName!: string;

  @IsEmail()
  recipientEmail!: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}
