import { IsInt, IsString, Min, MinLength } from 'class-validator';

// El sector pertenece al VENUE y define cuántas personas caben en esa zona.
export class CreateSectorDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsInt()
  @Min(1)
  capacity!: number;
}
