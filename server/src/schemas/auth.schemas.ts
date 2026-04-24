import { z } from 'zod';

export const RegisterSchema = z.object({
  email:     z.string().email('Email invalide'),
  password:  z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères'),
  firstName: z.string().min(1, 'Le prénom est requis').max(50),
  lastName:  z.string().min(1, 'Le nom est requis').max(50),
  phone:     z.string().max(20).optional(),
});

export const LoginSchema = z.object({
  email:    z.string().email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
});

export const UpdateProfileSchema = z
  .object({
    firstName: z.string().min(1).max(50).optional(),
    lastName:  z.string().min(1).max(50).optional(),
    phone:     z.string().max(20).nullable().optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: 'Au moins un champ est requis',
  });
