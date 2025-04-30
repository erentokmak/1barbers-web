import { useState } from 'react'
import { signIn, getSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import PhoneInput from 'react-phone-input-2'
import 'react-phone-input-2/lib/style.css'
import { useMutation, useLazyQuery } from '@apollo/client'
import moment from 'moment'
import { gql } from '@apollo/client'

import { Button } from '@/ui/button'
import { cn } from '@/lib/utils'
import { Label } from '@/ui/label'
import { Input } from '@/ui/input'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/ui/card'
import { useIsMobile } from '@/hooks/Responsive'
import { useToast } from '@/hooks/use-toast'
import { register } from '@/lib/api-v1/auth'
import { extractCountryCode, formatPhoneNumber } from '@/utils/formatters/phone'
import { ISignUpFormData, ISignUpFormErrors } from '@/types/auth'
import { TermsAndPrivacy } from '@/components/auth/terms-and-privacy'
import { validateSignUpFormFields } from '@/utils/validations/auth'
import { CREATE_CUSTOMER, UPDATE_CUSTOMER_QUICKESTA_INFO } from '@/graphql/mutations/customer'
import { GET_CUSTOMER_BY_EMAIL_AND_PHONE } from '@/graphql/queries/customer'

export default function SignUp() {
  const [formData, setFormData] = useState<ISignUpFormData>({
    name: '',
    surname: '',
    email: '',
    password: '',
    mobileNumber: '',
    countryCode: 90,
  })
  const [errors, setErrors] = useState<ISignUpFormErrors>({})
  const [isLoading, setIsLoading] = useState(false)
  const isMobile = useIsMobile()
  const { toast } = useToast()
  const router = useRouter()

  // GraphQL mutations
  const [createCustomer] = useMutation(CREATE_CUSTOMER)
  const [updateCustomerQuickestaInfo] = useMutation(UPDATE_CUSTOMER_QUICKESTA_INFO)
  const [getCustomerByEmailAndPhone] = useLazyQuery(GET_CUSTOMER_BY_EMAIL_AND_PHONE)

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
    if (errors[name as keyof ISignUpFormErrors]) {
      setErrors((prev) => ({ ...prev, [name]: '' }))
    }
  }

  const handlePhoneChange = (value: string, data: any) => {
    setFormData((prev) => ({
      ...prev,
      countryCode: extractCountryCode(data.dialCode),
      mobileNumber: value,
    }))
    if (errors.phone) {
      setErrors((prev) => ({ ...prev, phone: '' }))
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit(e as any)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      // Form validasyonu
      const validation = validateSignUpFormFields(formData)
      if (!validation.isValid) {
        if (validation.fieldErrors) {
          setErrors(validation.fieldErrors as ISignUpFormErrors)
        }
        return
      }

      // Quickesta'ya kayıt
      const registerData = {
        ...formData,
        mobileNumber: formatPhoneNumber(formData.mobileNumber, formData.countryCode),
        confirmPassword: formData.password,
      }

      const response = await register(registerData)

      if (response.isSuccess) {
        let quickestaUserId: string | null = null

        if (response.value && response.value.userIdentity) {
          quickestaUserId = response.value.userIdentity.id

          // Önce email veya telefon ile kayıtlı müşteri var mı kontrol et
          const { data: existingCustomerData } = await getCustomerByEmailAndPhone({
            variables: {
              email: formData.email,
              phone: formatPhoneNumber(formData.mobileNumber, formData.countryCode)
            }
          })

          if (existingCustomerData?.customers?.length > 0) {
            // Var olan müşteriyi güncelle
            const existingCustomer = existingCustomerData.customers[0]
            try {
              if (quickestaUserId) {
                const updateResult = await updateCustomerQuickestaInfo({
                  variables: {
                    customer_id: existingCustomer.id,
                    quickesta_user_id: quickestaUserId
                  }
                })
              }
            } catch (updateError) {
              console.error("Müşteri güncelleme hatası:", updateError)
            }
          } else {
            // Yeni müşteri oluştur
            try {
              const fullName = `${formData.name} ${formData.surname}`
              const formattedPhone = formatPhoneNumber(formData.mobileNumber, formData.countryCode)

              if (quickestaUserId) {
                const newCustomerResult = await createCustomer({
                  variables: {
                    input: {
                      business_id: 1,
                      full_name: fullName,
                      phone: formattedPhone,
                      email: formData.email,
                      quickesta_user_id: quickestaUserId,
                      is_quickesta_user: true,
                      created_at: moment().add(3, 'hours').toISOString(),
                    }
                  }
                })

                // Eğer quickesta_user_id veya is_quickesta_user alanları doğru şekilde atanmadıysa güncelle
                if (newCustomerResult.data && newCustomerResult.data.insert_customers_one) {
                  const customerId = newCustomerResult.data.insert_customers_one.id

                  if (!newCustomerResult.data.insert_customers_one.quickesta_user_id ||
                    !newCustomerResult.data.insert_customers_one.is_quickesta_user) {
                    try {
                      const updateResult = await updateCustomerQuickestaInfo({
                        variables: {
                          customer_id: customerId,
                          quickesta_user_id: quickestaUserId
                        }
                      })
                    } catch (updateError) {
                      console.error("Müşteri güncelleme hatası:", updateError)
                    }
                  }
                }
              }
            } catch (customerError) {
              console.error("Müşteri oluşturma hatası:", customerError)
            }
          }
        }

        toast({
          title: 'Kayıt başarılı!',
          description: 'Yönlendiriliyorsunuz...',
          duration: 2000,
        })

        const signInResult = await signIn('credentials', {
          redirect: false,
          email: formData.email,
          password: formData.password,
        })

        if (signInResult?.error) {
          const errorData = JSON.parse(signInResult.error)
          toast({
            variant: 'destructive',
            title: errorData.message,
            description: errorData.detail,
          })
          return
        }

        // Get the session data
        const session = await getSession()
        if (!session?.user) {
          toast({
            title: 'Hata',
            description: 'Kullanıcı bilgileri alınamadı',
            variant: 'destructive',
          })
          return
        }

        router.push('/')
      } else {
        // Hata mesajını daha anlaşılır hale getir
        let errorMessage = response.error || 'Bir hata oluştu.'

        // Eğer hata mesajı JSON formatındaysa, parse et ve daha anlaşılır hale getir
        try {
          if (typeof response.error === 'string' && response.error.includes('{')) {
            const errorData = JSON.parse(response.error)

            if (errorData.detail) {
              // Kullanıcı adı veya e-posta adresi zaten kullanılıyorsa
              if (errorData.detail.includes('is already taken')) {
                const takenFields = errorData.detail.split(',').map((field: string) => {
                  if (field.includes('Username')) {
                    return 'Kullanıcı adı'
                  } else if (field.includes('Email')) {
                    return 'E-posta adresi'
                  } else if (field.includes('Phone')) {
                    return 'Telefon numarası'
                  }
                  return field
                })

                errorMessage = `${takenFields.join(' ve ')} zaten kullanılıyor. Lütfen başka bir değer deneyin.`
              } else {
                errorMessage = errorData.detail
              }
            }
          }
        } catch (parseError) {
          console.error('Hata mesajı parse edilemedi:', parseError)
        }

        toast({
          variant: 'destructive',
          title: 'Kayıt başarısız',
          description: errorMessage,
        })
      }
    } catch (error: any) {
      // Hata mesajını daha anlaşılır hale getir
      let errorMessage = error.message || 'Lütfen daha sonra tekrar deneyiniz.'

      // Eğer hata mesajı JSON formatındaysa, parse et ve daha anlaşılır hale getir
      try {
        if (error.response?.data) {
          const errorData = error.response.data

          if (errorData.detail) {
            // Kullanıcı adı veya e-posta adresi zaten kullanılıyorsa
            if (errorData.detail.includes('is already taken')) {
              const takenFields = errorData.detail.split(',').map((field: string) => {
                if (field.includes('Username')) {
                  return 'Kullanıcı adı'
                } else if (field.includes('Email')) {
                  return 'E-posta adresi'
                } else if (field.includes('Phone')) {
                  return 'Telefon numarası'
                }
                return field
              })

              errorMessage = `${takenFields.join(' ve ')} zaten kullanılıyor. Lütfen başka bir email veya telefon numarası deneyin.`
            } else {
              errorMessage = errorData.detail
            }
          }
        }
      } catch (parseError) {
        console.error('Hata mesajı parse edilemedi:', parseError)
      }

      toast({
        variant: 'destructive',
        title: 'Bir sorun oluştu',
        description: errorMessage,
      })
    } finally {
      setIsLoading(false)
    }
  }

  const renderForm = () => (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="name">Ad</Label>
          <Input
            id="name"
            name="name"
            type="text"
            placeholder="Adınız"
            value={formData.name}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            required
            className={cn(errors.name && 'border-red-500')}
          />
          {errors.name && (
            <span className="text-xs text-red-500">{errors.name}</span>
          )}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="surname">Soyad</Label>
          <Input
            id="surname"
            name="surname"
            type="text"
            placeholder="Soyadınız"
            value={formData.surname}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            required
            className={cn(errors.surname && 'border-red-500')}
          />
          {errors.surname && (
            <span className="text-xs text-red-500">{errors.surname}</span>
          )}
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="email">E-posta</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="ornek@mail.com"
          value={formData.email}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          required
          className={cn(errors.email && 'border-red-500')}
        />
        {errors.email && (
          <span className="text-xs text-red-500">{errors.email}</span>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="password">Şifre</Label>
        <Input
          id="password"
          name="password"
          type="password"
          placeholder="••••••••"
          value={formData.password}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          required
          className={cn(errors.password && 'border-red-500')}
        />
        {errors.password && (
          <span className="text-xs text-red-500">{errors.password}</span>
        )}
      </div>

      <div className="grid gap-2">
        <Label>Telefon</Label>
        <PhoneInput
          country={'tr'}
          value={formData.mobileNumber}
          onChange={handlePhoneChange}
          onKeyDown={handleKeyDown}
          inputClass="!w-full !h-10 !text-xs !pl-12 !rounded-md !border-input !bg-background"
          containerClass="!w-full !bg-background"
          buttonClass="!h-10 !border !border-input !rounded-l-md !bg-background"
          dropdownClass="!w-[300px] !bg-background"
          searchClass="!bg-background"
          enableSearch
          searchPlaceholder="Ülke Ara..."
          searchNotFound="Ülke Bulunamadı"
          preferredCountries={['tr', 'us', 'gb', 'de']}
          inputProps={{
            name: 'phone',
            required: true,
            autoFocus: false,
          }}
        />
        {errors.phone && (
          <span className="text-xs text-red-500">{errors.phone}</span>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? 'Kayıt yapılıyor...' : 'Kayıt Ol'}
      </Button>

      {!isMobile && (
        <div className="text-center text-sm">
          Zaten hesabınız var mı?{' '}
          <Link href="/auth/sign-in" className="underline underline-offset-4">
            Giriş Yap
          </Link>
        </div>
      )}
    </form>
  )

  if (isMobile) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 md:p-10">
        <div className="w-full max-w-sm">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col items-center gap-2">
              <h1 className="text-xl font-bold">
                1BARBERS&apos;a Kayıt Olun
              </h1>
              <div className="text-center text-sm">
                Zaten hesabınız var mı?{' '}
                <Link
                  href="/auth/sign-in"
                  className="underline underline-offset-4"
                >
                  Giriş Yap
                </Link>
              </div>
            </div>

            {renderForm()}

            <TermsAndPrivacy />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center gap-2 self-center font-medium">
          <Image
            src="/assets/images/brand-images/quickestaiconwhite.png"
            alt="Quickesta"
            width={24}
            height={24}
            className="rounded-md bg-primary p-1"
          />
          <span>Quickesta</span>
        </div>
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-xl">Hesap Oluşturun</CardTitle>
            <CardDescription>
              Bilgilerinizi girerek hemen başlayın
            </CardDescription>
          </CardHeader>
          <CardContent>{renderForm()}</CardContent>
        </Card>
        <TermsAndPrivacy />
      </div>
    </div>
  )
}

export async function getServerSideProps(context) {
  return {
    props: {},
  }
}
