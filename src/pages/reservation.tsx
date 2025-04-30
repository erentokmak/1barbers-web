/**
 * @file Reservation.tsx
 * @description Randevu alma sayfası bileşeni. Bu sayfa, müşterilerin berber randevusu 
 * oluşturmasını sağlar. 5 adımlı bir form sürecini içerir:
 * 1. Berber seçimi
 * 2. Hizmet seçimi
 * 3. Tarih seçimi
 * 4. Saat seçimi
 * 5. Kişisel bilgiler (oturum açmamış kullanıcılar için)
 */

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import Head from "next/head";
import { signIn, getSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Calendar as CalendarIcon,
  Clock,
  User,
  Phone,
  Scissors,
  Check,
  Mail,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/button";
import { Calendar } from "@/ui/calendar";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/ui/form";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/popover";
import { BARBERS, AVAILABLE_HOURS } from "@/constants/data";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/ui/toast";
import Image from "next/image";
import { Card, CardContent } from "@/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQuery, useLazyQuery } from "@apollo/client";
import { register } from "@/lib/api-v1/auth";
import {
  extractCountryCode,
  formatPhoneNumber,
} from "@/utils/formatters/phone";
import PhoneInput from "react-phone-input-2";
import "react-phone-input-2/lib/style.css";
import moment from "moment";
import {
  CREATE_CUSTOMER,
  UPDATE_CUSTOMER_QUICKESTA_INFO,
} from "@/graphql/mutations/customer";
import { GET_CUSTOMER_BY_EMAIL_OR_PHONE } from "@/graphql/queries/customer";
import { CREATE_APPOINTMENT } from "@/graphql/mutations/appointment";
import {
  GET_AVAILABLE_TIME_SLOTS,
  CHECK_APPOINTMENT_AVAILABILITY,
} from "@/graphql/queries/appointment";
import { TermsAndPrivacy } from "@/components/auth/terms-and-privacy";
import {
  ICustomerByPhoneResponse,
  IAvailableTimeSlotsResponse,
  ICheckAvailabilityResponse,
} from "@/types/appointment";

// Form şeması tanımlaması
const formSchema = z.object({
  name: z.string().min(2, "İsim en az 2 karakter olmalıdır"),
  phone: z.string().min(10, "Geçerli bir telefon numarası giriniz"),
  email: z.string().email("Geçerli bir email adresi giriniz"),
  password: z.string().min(6, "Şifre en az 6 karakter olmalıdır"),
  date: z.date({
    required_error: "Lütfen bir tarih seçin",
  }),
  time: z.string({
    required_error: "Lütfen bir saat seçin",
  }),
  barber: z.string({
    required_error: "Lütfen bir berber seçin",
  }),
  service: z.string({
    required_error: "Lütfen bir hizmet seçin",
  }),
});

/**
 * @component ReservationPage
 * @description Ana randevu sayfası bileşeni. Tüm randevu alma sürecini yönetir.
 */
export default function ReservationPage() {
  const { toast } = useToast();

  /**
   * State tanımlamaları
   */
  const [selectedBarber, setSelectedBarber] = useState<string>("");
  const [step, setStep] = useState(1);
  const [countryCode, setCountryCode] = useState(90); // Türkiye için varsayılan ülke kodu
  const [isLoading, setIsLoading] = useState(false);
  const [session, setSession] = useState<any>(null);

  /**
   * GraphQL mutation ve query hook'ları
   */
  const [createCustomer] = useMutation(CREATE_CUSTOMER);
  const [createAppointment] = useMutation(CREATE_APPOINTMENT);
  const [updateCustomerQuickestaInfo] = useMutation(UPDATE_CUSTOMER_QUICKESTA_INFO);
  const [checkAvailability] = useLazyQuery<ICheckAvailabilityResponse>(CHECK_APPOINTMENT_AVAILABILITY);
  const [getCustomerByEmailOrPhone] = useLazyQuery<ICustomerByPhoneResponse>(GET_CUSTOMER_BY_EMAIL_OR_PHONE);

  /**
   * Form tanımlaması ve validasyon
   */
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      phone: "",
      email: "",
      password: "",
    },
  });

  /**
 * Dinamik form şeması - session durumuna göre güncellenir
 */
  const dynamicFormSchema = z.object({
    name: z.string().min(2, "İsim en az 2 karakter olmalıdır"),
    phone: z.string().min(10, "Geçerli bir telefon numarası giriniz"),
    email: z.string().email("Geçerli bir email adresi giriniz"),
    password: session?.user
      ? z.string().optional()
      : z.string().min(6, "Şifre en az 6 karakter olmalıdır"),
    date: z.date({
      required_error: "Lütfen bir tarih seçin",
    }),
    time: z.string({
      required_error: "Lütfen bir saat seçin",
    }),
    barber: z.string({
      required_error: "Lütfen bir berber seçin",
    }),
    service: z.string({
      required_error: "Lütfen bir hizmet seçin",
    }),
  });


  /**
   * Oturum kontrolü ve form otomatik doldurma
   * @effect
   */
  useEffect(() => {
    const checkSession = async () => {
      const currentSession = await getSession();
      setSession(currentSession);
    };

    checkSession();
  }, []);

  /**
   * Session varsa form değerlerini otomatik doldurma
   * @effect
   */
  useEffect(() => {
    if (session?.user) {
      form.setValue("name", session.user.name || "");
      form.setValue("email", session.user.email || "");
      if (session.user.phone) {
        form.setValue("phone", session.user.phone);
        const phoneCountryCode = extractCountryCode(session.user.phone);
        if (phoneCountryCode) {
          setCountryCode(phoneCountryCode);
        }
      }
    }
  }, [session, form]);

  /**
   * Telefon numarası değişikliği handler'ı
   * @param {string} value - Telefon numarası
   * @param {any} data - Ülke kodu ve diğer metadata
   */
  const handlePhoneChange = (value: string, data: any) => {
    form.setValue("phone", value);
    setCountryCode(extractCountryCode(data.dialCode));
  };

  /**
   * Form gönderme işlemi
   * @param {z.infer<typeof dynamicFormSchema>} values - Form değerleri
   */
  async function onSubmit(values: z.infer<typeof dynamicFormSchema>) {
    try {
      setIsLoading(true);
      let customerId: number;
      let quickestaUserId: string | null = null;
      let registrationSuccess = false;
      let registeredEmail = values.email;
      let registeredPassword = values.password || "";

      // Eğer kullanıcı oturum açmışsa, oturum verilerini kullan
      if (session?.user) {
        registeredEmail = session.user.email || values.email;
        registeredPassword = "********"; // Şifre için yer tutucu
      }

      // 1. E-posta veya telefon ile müşteri var mı kontrol et
      const customerResult = await getCustomerByEmailOrPhone({
        variables: {
          business_id: 1,
          email: registeredEmail,
          phone: values.phone,
        },
      });

      // Sadece oturum açmamış kullanıcılar için kayıt işlemi yap
      if (!session?.user) {
        try {
          // Quickesta API ile kullanıcı kaydı
          const registerData = {
            name: values.name.split(" ")[0],
            surname: values.name.includes(" ")
              ? values.name.substring(values.name.indexOf(" ") + 1)
              : "",
            email: values.email,
            password: values.password || "",
            confirmPassword: values.password || "",
            mobileNumber: formatPhoneNumber(values.phone, countryCode),
            countryCode: countryCode,
          };

          const registerResponse = await register(registerData);

          if (registerResponse.isSuccess) {
            quickestaUserId = registerResponse.value.userIdentity.id || null;
            registrationSuccess = true;
          } else {
            // Kullanıcı zaten var olabilir, hata mesajını kontrol et
            if (
              registerResponse.error &&
              registerResponse.error.includes("already exists")
            ) {
              // Bu durumda kullanıcı Quickesta'da zaten var demektir

              // Eğer kullanıcı login yapabiliyorsa quickesta_user_id'yi almak için
              // Otomatik olarak login yapmayı dene ve id'yi almaya çalış
              try {
                const signInResult = await signIn("credentials", {
                  email: values.email,
                  password: values.password || "",
                  redirect: false,
                });

                if (!signInResult?.error) {
                  const session = await getSession();
                  if (session?.user?.id) {
                    quickestaUserId = session.user.id;
                    registrationSuccess = true;
                  }
                }
              } catch (loginError) {
                console.error("Otomatik giriş hatası:", loginError);
              }

              // Hala ID bulunamadıysa -1 olarak işaretle (sonraki update adımlarının çalışması için)
              if (!quickestaUserId) {
                quickestaUserId = "-1"; // Var olan kullanıcı işareti
                registrationSuccess = true;
              }
            } else {
              // Başka bir hata
              throw new Error(
                registerResponse.error || "Quickesta hesabı oluşturulamadı"
              );
            }
          }
        } catch (error) {
          console.error("Quickesta hesap işlemi hatası:", error);
          // Ancak işleme devam etmeliyiz
        }
      } else {
        // Kullanıcı oturum açmış, oturum ID'sini kullan
        quickestaUserId = session.user.id;
        registrationSuccess = true;
      }

      // 3. Müşteri var mı kontrol et
      if (
        customerResult.data?.customers &&
        customerResult.data.customers.length > 0
      ) {
        // Müşteri var
        const customer = customerResult.data.customers[0];
        customerId = customer.id;

        // Quickesta ID'si varsa ve müşteri Quickesta ID'si yoksa, güncelle
        if (!customer.is_quickesta_user && quickestaUserId) {
          // Müşteri kaydını güncelle
          try {
            const updateResult = await updateCustomerQuickestaInfo({
              variables: {
                customer_id: customerId,
                quickesta_user_id: quickestaUserId,
              },
            });
          } catch (updateError) {
            console.error("Müşteri güncelleme hatası:", updateError);
          }
        }
      } else {
        // Önce login denemesi yap
        try {
          const loginResult = await signIn("credentials", {
            email: values.email,
            password: values.password || "",
            redirect: false,
          });

          if (!loginResult?.error) {
            // Login başarılı, session'ı al
            const newSession = await getSession();
            if (newSession?.user?.id) {
              quickestaUserId = newSession.user.id;
              registrationSuccess = true;
              setSession(newSession); // Session'ı güncelle
            }
          }
        } catch (loginError) {
          console.error("Login denemesi hatası:", loginError);
        }

        const newCustomerResult = await createCustomer({
          variables: {
            input: {
              business_id: 1,
              full_name: values.name,
              phone: values.phone,
              email: values.email,
              // UUID tipinde olduğu için string olarak gönderiyoruz
              quickesta_user_id: quickestaUserId ? quickestaUserId : null,
              // Quickesta kullanıcı ID'si varsa true, yoksa false
              is_quickesta_user:
                quickestaUserId !== null && quickestaUserId !== "-1",
              created_at: moment().add(3, "hours").toISOString(),
            },
          },
        });

        customerId = newCustomerResult.data.insert_customers_one.id;

        // Eğer geçerli bir Quickesta kullanıcı ID'si varsa ve müşteri bu ID ile oluşturulmadıysa,
        // müşteri kaydını güncelle
        if (
          quickestaUserId &&
          quickestaUserId !== "-1" &&
          (!newCustomerResult.data.insert_customers_one.quickesta_user_id ||
            !newCustomerResult.data.insert_customers_one.is_quickesta_user)
        ) {
          try {
            const updateResult = await updateCustomerQuickestaInfo({
              variables: {
                customer_id: customerId,
                // UUID tipinde olduğu için string olarak gönderiyoruz
                quickesta_user_id: quickestaUserId,
              },
            });
          } catch (updateError) {
            console.error("Yeni müşteri güncelleme hatası:", updateError);
          }
        }
      }

      // 4. Appointment time calculation
      const [hours, minutes] = values.time.split(":");
      const endTime = new Date();
      endTime.setUTCHours(parseInt(hours));
      endTime.setUTCMinutes(parseInt(minutes));
      endTime.setUTCMinutes(endTime.getUTCMinutes() + 60);
      const endTimeString = `${endTime
        .getUTCHours()
        .toString()
        .padStart(2, "0")}:${endTime
          .getUTCMinutes()
          .toString()
          .padStart(2, "0")}:00`;

      // 5. Randevu kontrolü
      const availabilityResult = await checkAvailability({
        variables: {
          business_id: 1,
          appointment_date: format(values.date, "yyyy-MM-dd"),
          start_time: values.time + ":00",
          end_time: endTimeString,
        },
      });

      if (
        availabilityResult.data?.appointments?.length &&
        availabilityResult.data.appointments.length > 0
      ) {
        toast({
          variant: "destructive",
          title: "Hata!",
          description: "Seçilen saat dolu! Lütfen başka bir saat seçin.",
          duration: 5000,
        });
        setIsLoading(false);
        return;
      }

      // 6. Randevu oluşturma
      await createAppointment({
        variables: {
          input: {
            business_id: 1,
            customer_id: customerId,
            team_member_id: 1,
            service_id: 1,
            appointment_date: format(values.date, "yyyy-MM-dd"),
            start_time: values.time + ":00",
            end_time: endTimeString,
            price_charged: 1000,
            status: "scheduled",
            created_at: moment().add(3, "hours").toISOString(),
          },
        },
      });

      // 7. Otomatik giriş yap (eğer başarılı kayıt/hesap varsa ve henüz giriş yapılmadıysa)
      if (registrationSuccess && !session?.user) {
        try {
          // NextAuth ile giriş yapma
          const signInResult = await signIn("credentials", {
            email: registeredEmail,
            password: registeredPassword,
            redirect: false,
          });

          if (signInResult?.error) {
            console.error("Otomatik giriş başarısız:", signInResult.error);
            // Giriş hatası olsa bile rezervasyon tamamlandı, devam ediyoruz
          } else {
            // Başarılı giriş, oturum bilgilerini al
            const session = await getSession();
            if (session?.user) {
              // Burada isteğe bağlı olarak session bilgilerini işleyebiliriz
              // veya kullanıcıyı başka bir sayfaya yönlendirebiliriz
            }
          }
        } catch (loginError) {
          console.error("Otomatik giriş hatası:", loginError);
          // Giriş hatası olsa bile rezervasyon tamamlandı, devam ediyoruz
        }
      }

      toast({
        title: "Rezervasyon Başarılı!",
        description: `${format(values.date, "PPP")} tarihinde saat ${values.time
          } için randevunuz oluşturuldu.`,
        duration: 5000,
        action: (
          <ToastAction altText="Tamam">
            <Check className="h-4 w-4" />
          </ToastAction>
        ),
      });

      form.reset();
      setSelectedBarber("");
      setStep(1);
      setIsLoading(false);

      // İsteğe bağlı olarak kullanıcıyı hesap sayfasına yönlendirebiliriz
      // router.push('/dashboard');
    } catch (error) {
      console.error("Rezervasyon hatası:", error);
      toast({
        variant: "destructive",
        title: "Hata!",
        description: "Rezervasyon alınırken bir hata oluştu!",
        duration: 5000,
      });
      setIsLoading(false);
    }
  }

  /**
   * Müsait saatleri kontrol etme query'si
   */
  const { data: availableSlots } = useQuery<IAvailableTimeSlotsResponse>(
    GET_AVAILABLE_TIME_SLOTS,
    {
      variables: {
        business_id: 1,
        date: form.watch("date")
          ? format(form.watch("date"), "yyyy-MM-dd")
          : null,
      },
      skip: !form.watch("date"),
    }
  );

  /**
   * Müsait saatleri filtreleme
   */
  const filteredHours = AVAILABLE_HOURS.filter((hour) => {
    if (!availableSlots) return true;

    const selectedDate = form.watch("date");
    const today = new Date();

    // Eğer seçilen tarih bugünse, geçmiş saatleri filtrele
    if (
      selectedDate &&
      format(selectedDate, "yyyy-MM-dd") === format(today, "yyyy-MM-dd")
    ) {
      const [hourStr, minuteStr] = hour.split(":");
      const selectedTime = new Date();
      selectedTime.setHours(parseInt(hourStr), parseInt(minuteStr), 0);

      if (selectedTime <= today) {
        return false;
      }
    }

    const [startHours, startMinutes] = hour.split(":");
    const startTime = new Date();
    startTime.setUTCHours(parseInt(startHours));
    startTime.setUTCMinutes(parseInt(startMinutes));

    const endTime = new Date(startTime);
    endTime.setUTCMinutes(endTime.getUTCMinutes() + 60);

    return !availableSlots.appointments.some((appointment) => {
      const [appStartHours, appStartMinutes] =
        appointment.start_time.split(":");
      const [appEndHours, appEndMinutes] = appointment.end_time.split(":");

      const appointmentStart = new Date();
      appointmentStart.setUTCHours(parseInt(appStartHours));
      appointmentStart.setUTCMinutes(parseInt(appStartMinutes));

      const appointmentEnd = new Date();
      appointmentEnd.setUTCHours(parseInt(appEndHours));
      appointmentEnd.setUTCMinutes(parseInt(appEndMinutes));

      return (
        (startTime >= appointmentStart && startTime < appointmentEnd) ||
        (endTime > appointmentStart && endTime <= appointmentEnd)
      );
    });
  });

  /**
   * Seçili berber bilgilerini alma
   */
  const selectedBarberData = BARBERS.find(
    (barber) => barber.id.toString() === selectedBarber
  );

  /**
   * Bir sonraki adıma geçiş fonksiyonu
   */
  const nextStep = () => {
    // Berber seçimi kontrolü
    if (step === 1 && !selectedBarber) {
      toast({
        variant: "destructive",
        title: "Hata!",
        description: "Lütfen bir berber seçin",
        duration: 5000,
      });
      return;
    }

    // Hizmet seçimi kontrolü
    if (step === 2 && !form.getValues("service")) {
      toast({
        variant: "destructive",
        title: "Hata!",
        description: "Lütfen bir hizmet seçin",
        duration: 5000,
      });
      return;
    }

    // Tarih seçimi kontrolü
    if (step === 3 && !form.getValues("date")) {
      toast({
        variant: "destructive",
        title: "Hata!",
        description: "Lütfen bir tarih seçin",
        duration: 5000,
      });
      return;
    }

    // Saat seçimi kontrolü
    if (step === 4 && !form.getValues("time")) {
      toast({
        variant: "destructive",
        title: "Hata!",
        description: "Lütfen bir saat seçin",
        duration: 5000,
      });
      return;
    }

    // Eğer kullanıcı oturum açmışsa ve saat seçiminden sonra bilgi formunu atla
    if (step === 4 && session?.user) {
      // Form değerlerini al
      const formValues = form.getValues();

      // Form değerlerini session bilgileriyle güncelle
      const updatedValues = {
        ...formValues,
        name: session.user.name || formValues.name,
        email: session.user.email || formValues.email,
        phone: session.user.phone || formValues.phone,
        password: "********", // Şifre için yer tutucu
      };

      // Formu doğrudan gönder
      onSubmit(updatedValues);
      return;
    }

    // Bir sonraki adıma geç
    setStep(step + 1);
  };

  /**
   * Bir önceki adıma dönüş fonksiyonu
   */
  const prevStep = () => {
    setStep(step - 1);
  };

  return (
    <>
      <Head>
        <title>Randevu Al | 1Barbers</title>
        <meta
          name="description"
          content="1Barbers ile online randevu alın. Profesyonel berberlerimizle tanışın ve randevunuzu hemen oluşturun."
        />
        <meta
          name="keywords"
          content="berber randevu, online randevu, kuaför randevu, 1barbers, berber rezervasyon"
        />
        <meta property="og:title" content="Randevu Al | 1Barbers" />
        <meta
          property="og:description"
          content="1Barbers ile online randevu alın. Profesyonel berberlerimizle tanışın ve randevunuzu hemen oluşturun."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://1barbers.com/reservation" />
        <meta
          property="og:image"
          content="https://1barbers.com/assets/images/og-image.jpg"
        />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Randevu Al | 1Barbers" />
        <meta
          name="twitter:description"
          content="1Barbers ile online randevu alın. Profesyonel berberlerimizle tanışın ve randevunuzu hemen oluşturun."
        />
        <meta
          name="twitter:image"
          content="https://1barbers.com/assets/images/og-image.jpg"
        />
        <link rel="canonical" href="https://1barbers.com/reservation" />
      </Head>
      <main className="min-h-screen bg-background text-foreground">
        <div className="container mx-auto px-4 py-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-12 text-center"
          >
            <h1 className="text-4xl font-bold">Rezervasyon</h1>
            <p className="mt-2 text-base text-muted-foreground">
              Profesyonel ekibimizle tanışın ve randevunuzu hemen alın.
            </p>
          </motion.div>

          <div className="mx-auto max-w-2xl">
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-6"
              >
                <div className="mb-8 flex justify-center space-x-2">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <div
                      key={s}
                      className={cn(
                        "h-2 w-2 rounded-full transition-all",
                        s <= step ? "bg-primary" : "bg-muted",
                        // Session varsa 5. adım noktasını gizle
                        s === 5 && session?.user ? "hidden" : ""
                      )}
                    />
                  ))}
                </div>

                <AnimatePresence mode="wait">
                  {step === 1 && (
                    <motion.div
                      key="step1"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ duration: 0.3 }}
                    >
                      <FormField
                        control={form.control}
                        name="barber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-md">
                              Berber Seçin
                            </FormLabel>
                            <FormControl>
                              <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                                {BARBERS.map((barber) => (
                                  <motion.div
                                    key={barber.id}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                  >
                                    <Card
                                      className={cn(
                                        "cursor-pointer transition-all",
                                        selectedBarber ===
                                        barber.id.toString() &&
                                        "border-2 border-primary shadow-lg"
                                      )}
                                      onClick={() => {
                                        field.onChange(barber.id.toString());
                                        setSelectedBarber(barber.id.toString());
                                      }}
                                    >
                                      <CardContent className="p-4">
                                        <div className="relative mb-4 aspect-square w-full overflow-hidden rounded-lg">
                                          <Image
                                            src={barber.image}
                                            alt={barber.name}
                                            fill
                                            className="object-cover transition-transform duration-300 hover:scale-110"
                                          />
                                        </div>
                                        <h3 className="text-center text-lg font-semibold">
                                          {barber.name}
                                        </h3>
                                        <p className="text-center text-sm text-muted-foreground">
                                          {barber.experience} Yıl Deneyim
                                        </p>
                                      </CardContent>
                                    </Card>
                                  </motion.div>
                                ))}
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </motion.div>
                  )}

                  {step === 2 && selectedBarberData && (
                    <motion.div
                      key="step2"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ duration: 0.3 }}
                    >
                      <FormField
                        control={form.control}
                        name="service"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-md">
                              Hizmet Seçin
                            </FormLabel>
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                              {selectedBarberData.services.map((service) => (
                                <motion.div
                                  key={service.id}
                                  whileHover={{ scale: 1.02 }}
                                  whileTap={{ scale: 0.98 }}
                                >
                                  <Card
                                    className={cn(
                                      "cursor-pointer transition-all",
                                      field.value === service.id.toString() &&
                                      "border-2 border-primary shadow-lg"
                                    )}
                                    onClick={() =>
                                      field.onChange(service.id.toString())
                                    }
                                  >
                                    <CardContent className="flex items-center justify-between p-4">
                                      <div className="flex items-center space-x-4">
                                        <Scissors className="h-6 w-6 text-primary" />
                                        <div>
                                          <h3 className="font-semibold">
                                            {service.name}
                                          </h3>
                                          <p className="text-sm text-muted-foreground">
                                            {service.duration} dk
                                          </p>
                                        </div>
                                      </div>
                                      <span className="text-lg font-bold">
                                        {service.price} TL
                                      </span>
                                    </CardContent>
                                  </Card>
                                </motion.div>
                              ))}
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </motion.div>
                  )}

                  {step === 3 && (
                    <motion.div
                      key="step3"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ duration: 0.3 }}
                    >
                      <FormField
                        control={form.control}
                        name="date"
                        render={({ field }) => (
                          <FormItem className="flex flex-col">
                            <FormLabel className="text-md">
                              Tarih Seçin
                            </FormLabel>
                            <Popover>
                              <PopoverTrigger asChild>
                                <FormControl>
                                  <Button
                                    variant={"outline"}
                                    className={cn(
                                      "h-12 w-full pl-3 text-left text-lg font-normal",
                                      !field.value && "text-muted-foreground"
                                    )}
                                  >
                                    {field.value ? (
                                      format(field.value, "PPP")
                                    ) : (
                                      <span>Tarih seçin</span>
                                    )}
                                    <CalendarIcon className="ml-auto h-5 w-5 opacity-50" />
                                  </Button>
                                </FormControl>
                              </PopoverTrigger>
                              <PopoverContent
                                className="w-auto p-0"
                                align="start"
                              >
                                <Calendar
                                  mode="single"
                                  selected={field.value}
                                  onSelect={field.onChange}
                                  disabled={(date) => {
                                    const today = new Date();
                                    today.setHours(0, 0, 0, 0);
                                    date.setHours(0, 0, 0, 0);

                                    // Geçmiş tarihleri devre dışı bırak
                                    if (date < today) {
                                      return true;
                                    }

                                    // Pazar günlerini devre dışı bırak (0 = Pazar)
                                    if (date.getDay() === 0) {
                                      return true;
                                    }

                                    return false;
                                  }}
                                  initialFocus
                                />
                              </PopoverContent>
                            </Popover>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </motion.div>
                  )}

                  {step === 4 && (
                    <motion.div
                      key="step4"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ duration: 0.3 }}
                    >
                      <FormField
                        control={form.control}
                        name="time"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-md">
                              Saat Seçin
                            </FormLabel>
                            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                              {filteredHours.map((hour) => (
                                <motion.div
                                  key={hour}
                                  whileHover={{ scale: 1.05 }}
                                  whileTap={{ scale: 0.95 }}
                                >
                                  <Button
                                    type="button"
                                    variant={
                                      field.value === hour
                                        ? "default"
                                        : "outline"
                                    }
                                    className="w-full"
                                    onClick={() => field.onChange(hour)}
                                  >
                                    <Clock className="mr-2 h-4 w-4" />
                                    {hour}
                                  </Button>
                                </motion.div>
                              ))}
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </motion.div>
                  )}

                  {/* Sadece oturum açmamış kullanıcılar için bilgi formunu göster */}
                  {step === 5 && !session?.user && (
                    <motion.div
                      key="step5"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ duration: 0.3 }}
                      className="space-y-6"
                    >
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-md">Ad Soyad</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <input
                                  {...field}
                                  className="flex h-10 w-full rounded-md border border-input bg-background pl-10 pr-3 py-2 text-xs ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                  placeholder="Adınız ve soyadınız"
                                />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="phone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-md">Telefon</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <PhoneInput
                                  country={"tr"}
                                  value={field.value}
                                  onChange={handlePhoneChange}
                                  inputClass="!w-full !h-10 !text-xs !pl-12 !rounded-md !border-input !bg-background"
                                  containerClass="!w-full !bg-background"
                                  buttonClass="!h-10 !border !border-input !rounded-l-md !bg-background"
                                  dropdownClass="!w-[300px] !bg-background"
                                  searchClass="!bg-background"
                                  enableSearch
                                  searchPlaceholder="Ülke Ara..."
                                  searchNotFound="Ülke Bulunamadı"
                                  preferredCountries={["tr", "us", "gb", "de"]}
                                  inputProps={{
                                    name: "phone",
                                    required: true,
                                    autoFocus: false,
                                  }}
                                />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-md">Email</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <input
                                  {...field}
                                  type="email"
                                  className="flex h-10 w-full rounded-md border border-input bg-background pl-10 pr-3 py-2 text-xs ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                  placeholder="Email adresiniz"
                                />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-md">Şifre</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <input
                                  {...field}
                                  type="password"
                                  className="flex h-10 w-full rounded-md border border-input bg-background pl-10 pr-3 py-2 text-xs ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                  placeholder="Hesabınız için şifre oluşturun"
                                />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <TermsAndPrivacy />
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex justify-between pt-6">
                  {step > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={prevStep}
                      className="w-24"
                    >
                      Geri
                    </Button>
                  )}
                  {step < 5 ? (
                    <Button
                      type="button"
                      onClick={nextStep}
                      className={cn("ml-auto", step === 1 && "w-full")}
                    >
                      {step === 4 && session?.user
                        ? "Rezervasyon Yap"
                        : "İleri"}
                    </Button>
                  ) : (
                    <Button
                      type="submit"
                      className="ml-auto"
                      disabled={isLoading}
                    >
                      {isLoading ? "İşleniyor..." : "Rezervasyon Yap"}
                    </Button>
                  )}
                </div>
              </form>
            </Form>
          </div>
        </div>
      </main>
    </>
  );
}
