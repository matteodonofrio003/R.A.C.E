##############################################################################
# Empty ChibiOS/RT project for the ST NUCLEO-G474RE.
#
# Override CHIBIOS when the ChibiOS 21.11 tree is installed elsewhere:
#   make CHIBIOS=/path/to/chibios2111
##############################################################################

ifeq ($(USE_OPT),)
  USE_OPT = -O2 -ggdb -fomit-frame-pointer -falign-functions=16
endif

ifeq ($(USE_COPT),)
  USE_COPT =
endif

ifeq ($(USE_CPPOPT),)
  USE_CPPOPT = -fno-rtti
endif

ifeq ($(USE_LINK_GC),)
  USE_LINK_GC = yes
endif

ifeq ($(USE_LTO),)
  USE_LTO = yes
endif

ifeq ($(USE_VERBOSE_COMPILE),)
  USE_VERBOSE_COMPILE = no
endif

ifeq ($(USE_SMART_BUILD),)
  USE_SMART_BUILD = yes
endif

ifeq ($(USE_PROCESS_STACKSIZE),)
  USE_PROCESS_STACKSIZE = 0x400
endif

ifeq ($(USE_EXCEPTIONS_STACKSIZE),)
  USE_EXCEPTIONS_STACKSIZE = 0x400
endif

ifeq ($(USE_FPU),)
  USE_FPU = no
endif

ifeq ($(USE_FPU_OPT),)
  USE_FPU_OPT = -mfloat-abi=$(USE_FPU) -mfpu=fpv4-sp-d16
endif

PROJECT = ECU2_Powertrain
MCU = cortex-m4

CHIBIOS ?= ../../../../../ChibiStudio/chibios2111
CONFDIR = ./cfg
BUILDDIR = ./build
DEPDIR = ./.dep

include $(CHIBIOS)/os/license/license.mk
include $(CHIBIOS)/os/common/startup/ARMCMx/compilers/GCC/mk/startup_stm32g4xx.mk
include $(CHIBIOS)/os/hal/hal.mk
include $(CHIBIOS)/os/hal/ports/STM32/STM32G4xx/platform.mk
include $(CHIBIOS)/os/hal/boards/ST_NUCLEO64_G474RE/board.mk
include $(CHIBIOS)/os/hal/osal/rt-nil/osal.mk
include $(CHIBIOS)/os/rt/rt.mk
include $(CHIBIOS)/os/common/ports/ARMv7-M-ALT/compilers/GCC/mk/port.mk
include $(CHIBIOS)/tools/mk/autobuild.mk

LDSCRIPT = $(STARTUPLD)/STM32G474xE.ld

CSRC = $(ALLCSRC) \
       $(TESTSRC) \
       $(CHIBIOS)/os/hal/lib/streams/chprintf.c \
       main.c
CPPSRC = $(ALLCPPSRC)
ASMSRC = $(ALLASMSRC)
ASMXSRC = $(ALLXASMSRC)

INCDIR = $(CONFDIR) ./include $(ALLINC) $(TESTINC) $(CHIBIOS)/os/hal/lib/streams
CWARN = -Wall -Wextra -Wundef -Wstrict-prototypes -Wcast-align=strict
CPPWARN = -Wall -Wextra -Wundef

UDEFS = -DCHPRINTF_USE_FLOAT=1
UADEFS =
UINCDIR =
ULIBDIR =
ULIBS =

RULESPATH = $(CHIBIOS)/os/common/startup/ARMCMx/compilers/GCC/mk
include $(RULESPATH)/arm-none-eabi.mk
include $(RULESPATH)/rules.mk
