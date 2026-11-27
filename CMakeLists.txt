cmake_minimum_required(VERSION 3.16)
project(terratec LANGUAGES CXX)
add_executable(terratec-core core/main.cpp)
# The API, the tests and the release package run <project>/build/terratec-core, so the
# executable always goes there, whichever build directory is used (an in-source
# `cmake . && make`, an IDE's cmake-build-debug, build/) and for every configuration
# of multi-config generators (no build/Release/ subfolder).
set(TERRATEC_CORE_DIR "${PROJECT_SOURCE_DIR}/build")
set_target_properties(terratec-core PROPERTIES RUNTIME_OUTPUT_DIRECTORY "${TERRATEC_CORE_DIR}")
foreach(config IN ITEMS DEBUG RELEASE RELWITHDEBINFO MINSIZEREL)
  set_target_properties(terratec-core PROPERTIES RUNTIME_OUTPUT_DIRECTORY_${config} "${TERRATEC_CORE_DIR}")
endforeach()
target_compile_features(terratec-core PRIVATE cxx_std_17)
if(CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
  target_compile_options(terratec-core PRIVATE -Wall -Wextra -Wpedantic)
endif()
# The core is a small command-line calculation (arguments in, JSON out), so on
# Linux it is linked fully static: one executable that runs on any x86-64 Linux,
# whatever its C and C++ libraries. A core linked against the build machine's
# libraries fails on older systems ("GLIBCXX_3.4.32 not found" from a core built
# on Ubuntu 24.04 and run on 22.04, the target), and so would a release archive
# built on a newer CI runner. Where static linking is unavailable (no static C
# library installed), the core is linked normally: build it on the machine that runs it.
option(TERRATEC_STATIC_CORE "Link terratec-core statically on Linux" ON)
if(TERRATEC_STATIC_CORE AND CMAKE_SYSTEM_NAME STREQUAL "Linux")
  include(CheckCXXSourceCompiles)
  set(CMAKE_REQUIRED_LINK_OPTIONS -static)
  check_cxx_source_compiles("#include <iostream>\nint main(){std::cout<<1.5<<std::endl;}" TERRATEC_CAN_LINK_STATIC)
  unset(CMAKE_REQUIRED_LINK_OPTIONS)
  if(TERRATEC_CAN_LINK_STATIC)
    target_link_options(terratec-core PRIVATE -static)
  else()
    message(STATUS "terratec-core: static linking unavailable (install the static C library, e.g. glibc-static); linking dynamically")
  endif()
endif()
enable_testing()
add_test(NAME room_geometry COMMAND terratec-core 6 4 2.8)
set_tests_properties(room_geometry PROPERTIES PASS_REGULAR_EXPRESSION "\"area\":24")
add_test(NAME rejects_negative_dimensions COMMAND terratec-core -1 4 2.8)
set_tests_properties(rejects_negative_dimensions PROPERTIES WILL_FAIL TRUE)
add_test(NAME polygon_five_walls COMMAND terratec-core --polygon 3 -3 -2 0 -3 3 -2 3 2 -3 2)
set_tests_properties(polygon_five_walls PROPERTIES PASS_REGULAR_EXPRESSION "\"area\":27,")
add_test(NAME polygon_three_walls COMMAND terratec-core --polygon 3 0 -2 3 2 -3 2)
set_tests_properties(polygon_three_walls PROPERTIES PASS_REGULAR_EXPRESSION "\"area\":12,")
add_test(NAME polygon_rejects_two_corners COMMAND terratec-core --polygon 3 0 0 1 1)
set_tests_properties(polygon_rejects_two_corners PROPERTIES WILL_FAIL TRUE)
