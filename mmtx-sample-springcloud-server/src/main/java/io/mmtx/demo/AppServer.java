package io.mmtx.demo;



import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;
import org.springframework.cloud.openfeign.EnableFeignClients;

import io.mmtx.rm.datasource.ConnectionProxy;

@SpringBootApplication
@EnableFeignClients
@MapperScan("io.mmtx.demo.mapper")
@EnableAutoConfiguration
@EnableDiscoveryClient
public class AppServer {
    public static void main(String[] args) {
        SpringApplication.run(AppServer.class, args);
        boolean bres = ConnectionProxy.IS_REPORT_SUCCESS_ENABLE;
		 System.out.println("bRes:======"+bres);
    }
}
