"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"
import z from "zod"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { EyeIcon, EyeOffIcon } from "lucide-react"


export const signupWithEmailSchema = z.object({
  full_name: z.string().min(2, "Full name must be at least 2 characters").max(100, "Full name must be less than 100 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  password_confirm: z.string()
}).refine((data) => data.password === data.password_confirm, {
  message: "Passwords do not match",
  path: ["password_confirm"]
})


function SignUpForm() {

  const router = useRouter()
  const { control, reset, handleSubmit, formState: {
    isValid,
    isSubmitting,
  } } = useForm<z.infer<typeof signupWithEmailSchema>>({
    resolver: zodResolver(signupWithEmailSchema),
    mode: "onChange",
    defaultValues: {
      full_name: "",
      email: "tranthuyen2222@gmail.com",
      password: "123456",
      password_confirm: "123456"
    }
  });
  const [showPassword, setShowPassword] = useState({
    password: false,
    password_confirm: false,
  })
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (data: z.infer<typeof signupWithEmailSchema>) => {

  }


  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">Create an account</CardTitle>
        <CardDescription>
          Start your account
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form id="signup-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4" suppressHydrationWarning={true}>
          {/* API err message */}

          <FieldGroup>
            <Controller
              control={control}
              name='full_name'
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="full_name" className="cursor-pointer">Full Name</FieldLabel>
                  <Input
                    {...field}
                    id="full_name"
                    aria-invalid={fieldState.invalid}
                    placeholder="John Doe"
                    autoComplete="name"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            <Controller
              name="email"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="email" className="cursor-pointer">
                    Email
                  </FieldLabel>
                  <Input
                    {...field}
                    id="email"
                    aria-invalid={fieldState.invalid}
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            <Controller
              name="password"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="password" className="cursor-pointer">
                    Password
                  </FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      {...field}
                      id="password"
                      type={showPassword.password ? "text" : "password"}
                      aria-invalid={fieldState.invalid}
                      placeholder="Enter password"
                      autoComplete="current-password"
                    />
                    <InputGroupAddon align="inline-end" className="cursor-pointer"
                      onClick={() => { setShowPassword(prev => ({ ...prev, password: !prev.password })) }}>
                      {showPassword.password ? <EyeOffIcon /> : <EyeIcon />}
                    </InputGroupAddon>
                  </InputGroup>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="password_confirm"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="password_confirm" className="cursor-pointer">
                    Confirm Password
                  </FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      {...field}
                      id="password_confirm"
                      type={showPassword.password_confirm ? "text" : "password"}
                      aria-invalid={fieldState.invalid}
                      placeholder="Confirm password"
                      autoComplete="current-confirm-password"
                    />
                    <InputGroupAddon align="inline-end" className="cursor-pointer"
                      onClick={() => { setShowPassword(prev => ({ ...prev, password_confirm: !prev.password_confirm })) }}>
                      {showPassword.password_confirm ? <EyeOffIcon /> : <EyeIcon />}
                    </InputGroupAddon>
                  </InputGroup>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

          </FieldGroup>

        </form>

      </CardContent>

      <CardFooter className="text-center flex-col">
        <Button type='submit' form='signup-form' className="w-full" disabled={!isValid || isSubmitting}>
          {isSubmitting ? "Signing up..." : "Sign up"}
        </Button>
        <div className="mt-4 text-center text-sm">
          <span className="text-muted-foreground">Already have an account? </span>
          <Link href="/auth/login" className="text-primary hover:underline font-medium">
            Sign in
          </Link>
        </div>
      </CardFooter>
    </Card>
  )
}

// function SignUpForm1() {

//   const router = useRouter()
//   const [fullName, setFullName] = useState("Trần Thuyên")
//   const [email, setEmail] = useState("tranthuyen2222@gmail.com")
//   const [password, setPassword] = useState("123456")
//   const [confirmPassword, setConfirmPassword] = useState("123456")
//   const [error, setError] = useState<string | null>(null)
//   const [loading, setLoading] = useState(false)

//   const handleSignup = async (e: React.FormEvent) => {
//     e.preventDefault()
//     setError(null)

//     if (!fullName.trim()) {
//       setError("Full name is required")
//       return
//     }

//     if (!email.trim()) {
//       setError("Email is required")
//       return
//     }

//     if (password !== confirmPassword) {
//       setError("Passwords do not match")
//       return
//     }

//     if (password.length < 6) {
//       setError("Password must be at least 6 characters")
//       return
//     }

//     setLoading(true)
//     const result = await signupWithEmail({ email, password, password_confirm: confirmPassword, full_name: fullName })

//     if (!result.success) {
//       setError(result.message || "Failed to sign up")
//       setLoading(false)
//       return
//     }

//     // show success message or redirect to login page
//     toast.success(result?.message || "Account created successfully! Please log in.", { duration: 3000 })
//     setTimeout(() => {
//       router.replace("/auth/login")
//     }, 1000)
//   }


//   return (
//     <Card className="w-full max-w-md">
//       <CardHeader className="space-y-1">
//         <CardTitle className="text-2xl font-bold">Create an account</CardTitle>
//         <CardDescription>
//           Start your IELTS vocabulary journey today
//         </CardDescription>
//       </CardHeader>
//       <CardContent>
//         <form onSubmit={handleSignup} className="space-y-4">
//           {error && (
//             <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-lg border border-destructive/20">
//               {error}
//             </div>
//           )}
//           <div className="space-y-2">
//             <label htmlFor="full_name" className="text-sm font-medium">
//               Full Name
//             </label>
//             <Input
//               id="full_name"
//               type="text"
//               placeholder="John Doe"
//               value={fullName}
//               onChange={(e) => setFullName(e.target.value)}
//               required
//               disabled={loading}
//             />
//           </div>
//           <div className="space-y-2">
//             <label htmlFor="email" className="text-sm font-medium">
//               Email
//             </label>
//             <Input
//               id="email"
//               type="email"
//               placeholder="you@example.com"
//               value={email}
//               onChange={(e) => setEmail(e.target.value)}
//               required
//               disabled={loading}
//             />
//           </div>
//           <div className="space-y-2">
//             <label htmlFor="password" className="text-sm font-medium">
//               Password
//             </label>
//             <Input
//               id="password"
//               type="password"
//               placeholder="••••••••"
//               value={password}
//               onChange={(e) => setPassword(e.target.value)}
//               required
//               disabled={loading}
//             />
//           </div>
//           <div className="space-y-2">
//             <label htmlFor="confirmPassword" className="text-sm font-medium">
//               Confirm Password
//             </label>
//             <Input
//               id="confirmPassword"
//               type="password"
//               placeholder="••••••••"
//               value={confirmPassword}
//               onChange={(e) => setConfirmPassword(e.target.value)}
//               required
//               disabled={loading}
//             />
//           </div>
//           <Button type="submit" className="w-full" disabled={loading}>
//             {loading ? "Creating account..." : "Sign up"}
//           </Button>
//         </form>
//         <div className="mt-4 text-center text-sm">
//           <span className="text-muted-foreground">Already have an account? </span>
//           <Link href="/auth/login" className="text-primary hover:underline font-medium">
//             Sign in
//           </Link>
//         </div>
//       </CardContent>
//     </Card>
//   )
// }

export default SignUpForm
